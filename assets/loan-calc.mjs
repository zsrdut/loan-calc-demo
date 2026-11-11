// 贷款月供计算核心：纯函数、无 DOM、无网络、无第三方依赖。
// 金额内部统一以“分”为单位（安全整数），展示层再格式化为两位小数。

/** 期限上限：技术保护，避免异常输入导致页面卡顿。 */
export const MAX_MONTHS = 1200;

/** 金额上限（元）：保证换算为分后仍在 JS 安全整数范围内。 */
export const MAX_PRINCIPAL_YUAN = 1e12;

const AMOUNT_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const RATE_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const MONTHS_PATTERN = /^\d+$/;

/**
 * 非负数值 half-up 取整到分。参与取整的值均为非负，因此等价于 Math.round。
 * @param {number} value
 * @returns {number}
 */
export function roundCents(value) {
  return Math.round(value);
}

function sanitizeNumericText(text) {
  return String(text == null ? '' : text).replace(/[,，\s]/g, '');
}

function normalizeMethod(method) {
  return method === 'equal-principal' ? 'equal-principal' : 'equal-payment';
}

/**
 * 清洗并校验表单文本，转换为内部计算模型。
 * @param {{ amountText?: string, rateText?: string, monthsText?: string, method?: string }} raw
 * @returns {{ ok: boolean, values?: { principalCents: number, annualRatePercent: number, months: number, method: 'equal-payment' | 'equal-principal' }, errors: Record<string, string> }}
 */
export function validateLoanInput(raw) {
  const errors = {};
  const amountText = sanitizeNumericText(raw && raw.amountText);
  const rateText = sanitizeNumericText(raw && raw.rateText);
  const monthsText = sanitizeNumericText(raw && raw.monthsText);

  let principalCents = 0;
  let annualRatePercent = 0;
  let months = 0;

  // 金额
  if (amountText === '') {
    errors.amount = '请输入贷款金额';
  } else if (amountText.startsWith('-')) {
    errors.amount = '贷款金额必须大于 0';
  } else if (!AMOUNT_PATTERN.test(amountText)) {
    errors.amount = '请输入有效的贷款金额（正数，最多两位小数）';
  } else {
    const yuan = Number(amountText);
    const cents = Math.round(yuan * 100);
    if (!Number.isFinite(yuan) || !Number.isFinite(cents)) {
      errors.amount = '贷款金额超出可计算范围';
    } else if (yuan <= 0) {
      errors.amount = '贷款金额必须大于 0';
    } else if (yuan > MAX_PRINCIPAL_YUAN) {
      errors.amount = '贷款金额超出可计算范围';
    } else if (!Number.isSafeInteger(cents)) {
      errors.amount = '贷款金额超出可计算范围';
    } else {
      principalCents = cents;
    }
  }

  // 年利率
  if (rateText === '') {
    errors.rate = '请输入年利率';
  } else if (rateText.startsWith('-')) {
    errors.rate = '年利率不能为负数';
  } else if (!RATE_PATTERN.test(rateText)) {
    errors.rate = '请输入有效的年利率（百分数，如 4.2）';
  } else {
    const rate = Number(rateText);
    if (!Number.isFinite(rate)) {
      errors.rate = '年利率数值过大';
    } else if (rate < 0) {
      errors.rate = '年利率不能为负数';
    } else {
      annualRatePercent = rate;
    }
  }

  // 期限
  if (monthsText === '') {
    errors.months = '请输入贷款期限';
  } else if (!MONTHS_PATTERN.test(monthsText)) {
    errors.months = '贷款期限必须为正整数（月）';
  } else {
    const value = Number(monthsText);
    if (value === 0) {
      errors.months = '贷款期限至少为 1 期';
    } else if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      errors.months = '贷款期限必须为正整数（月）';
    } else if (value > MAX_MONTHS) {
      errors.months = '贷款期限最长为 ' + MAX_MONTHS + ' 期';
    } else {
      months = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    values: {
      principalCents,
      annualRatePercent,
      months,
      method: normalizeMethod(raw && raw.method)
    },
    errors: {}
  };
}

function assertValidInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('贷款输入必须为对象');
  }
  const { principalCents, annualRatePercent, months, method } = input;
  if (!Number.isSafeInteger(principalCents) || principalCents <= 0) {
    throw new TypeError('贷款金额（分）必须为正安全整数');
  }
  if (typeof annualRatePercent !== 'number' || !Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    throw new TypeError('年利率必须为非负有限数值');
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    throw new TypeError('贷款期限必须为 1 到 ' + MAX_MONTHS + ' 之间的整数');
  }
  if (method !== 'equal-payment' && method !== 'equal-principal') {
    throw new TypeError('不支持的还款方式');
  }
}

function assertSafeInteger(value, label) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(label + '超出可计算范围');
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(label + '不是安全整数');
  }
}

/**
 * 把分位尾差按 1 分轮转分摊到目标行；skip 负向会变负的行。
 * @param {number[]} values
 * @param {number} delta 有符号差值
 * @param {number} start 起始下标（含）
 * @param {number} end 结束下标（含）
 */
function distributeCents(values, delta, start, end) {
  if (delta === 0) return;
  const count = end - start + 1;
  if (count <= 0) return;

  const step = delta > 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  let index = start;
  let skippedInRow = 0;

  while (remaining > 0) {
    if (step < 0 && values[index] < 1) {
      skippedInRow += 1;
      if (skippedInRow >= count) break;
    } else {
      values[index] += step;
      remaining -= 1;
      skippedInRow = 0;
    }
    index += 1;
    if (index > end) index = start;
  }
}

/**
 * 对精确摊销行做逐行取整、尾差校正与余额复算，保证：
 * 本金合计 = 贷款金额、利息合计 = 总利息、每行月供 = 本金 + 利息、末期余额 = 0。
 */
function buildRows(exactRows, principalCents, totalInterestCents, months) {
  const principal = exactRows.map((row) => roundCents(row.principalExact));
  const interest = exactRows.map((row) => roundCents(row.interestExact));

  const sumPrincipal = principal.reduce((sum, value) => sum + value, 0);
  const sumInterest = interest.reduce((sum, value) => sum + value, 0);
  const deltaPrincipal = principalCents - sumPrincipal;
  const deltaInterest = totalInterestCents - sumInterest;

  // 尾差分摊目标：第 2..n-1 期；n <= 2 时只能调整末期。
  let targetStart = 1;
  let targetEnd = months - 2;
  if (targetEnd < targetStart) {
    targetStart = months - 1;
    targetEnd = months - 1;
  }

  distributeCents(principal, deltaPrincipal, targetStart, targetEnd);
  distributeCents(interest, deltaInterest, targetStart, targetEnd);

  const rows = [];
  let balance = principalCents;
  for (let i = 0; i < months; i += 1) {
    balance -= principal[i];
    rows.push({
      period: i + 1,
      paymentCents: principal[i] + interest[i],
      principalCents: principal[i],
      interestCents: interest[i],
      balanceCents: balance
    });
  }

  const finalPrincipal = rows.reduce((sum, row) => sum + row.principalCents, 0);
  const finalInterest = rows.reduce((sum, row) => sum + row.interestCents, 0);
  if (finalPrincipal !== principalCents) {
    throw new RangeError('计划表本金尾差校正失败');
  }
  if (finalInterest !== totalInterestCents) {
    throw new RangeError('计划表利息尾差校正失败');
  }
  if (balance !== 0) {
    throw new RangeError('计划表末期余额未归零');
  }

  return rows;
}

function calculateEqualPayment(principalCents, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 100 / 12;
  let paymentExactCents;
  let totalInterestCents;

  if (monthlyRate === 0) {
    paymentExactCents = principalCents / months;
    totalInterestCents = 0;
  } else {
    paymentExactCents =
      (principalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
    totalInterestCents = roundCents(months * paymentExactCents - principalCents);
  }

  if (!Number.isFinite(paymentExactCents)) {
    throw new RangeError('月供计算结果不是有限数值');
  }
  assertSafeInteger(totalInterestCents, '总利息');

  const exactRows = [];
  let balanceExact = principalCents;
  for (let i = 1; i <= months; i += 1) {
    const interestExact = balanceExact * monthlyRate;
    const principalExact = i === months ? balanceExact : paymentExactCents - interestExact;
    balanceExact -= principalExact;
    exactRows.push({ principalExact, interestExact });
  }

  const rows = buildRows(exactRows, principalCents, totalInterestCents, months);

  return {
    method: 'equal-payment',
    monthlyPaymentCents: roundCents(paymentExactCents),
    firstPaymentCents: rows[0].paymentCents,
    lastPaymentCents: rows[rows.length - 1].paymentCents,
    totalInterestCents,
    totalPaymentCents: principalCents + totalInterestCents,
    rows
  };
}

function calculateEqualPrincipal(principalCents, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 100 / 12;
  const totalInterestCents =
    monthlyRate === 0
      ? 0
      : roundCents((principalCents * monthlyRate * (months + 1)) / 2);
  assertSafeInteger(totalInterestCents, '总利息');

  const basePrincipalExact = principalCents / months;
  const exactRows = [];
  let balanceExact = principalCents;
  for (let i = 1; i <= months; i += 1) {
    const principalExact = i === months ? balanceExact : basePrincipalExact;
    const interestExact = balanceExact * monthlyRate;
    balanceExact -= principalExact;
    exactRows.push({ principalExact, interestExact });
  }

  const rows = buildRows(exactRows, principalCents, totalInterestCents, months);

  return {
    method: 'equal-principal',
    monthlyPaymentCents: null,
    firstPaymentCents: rows[0].paymentCents,
    lastPaymentCents: rows[rows.length - 1].paymentCents,
    totalInterestCents,
    totalPaymentCents: principalCents + totalInterestCents,
    rows
  };
}

/**
 * 计算贷款摊销结果。
 * @param {{ principalCents: number, annualRatePercent: number, months: number, method: 'equal-payment' | 'equal-principal' }} input
 * @returns {{ method: string, monthlyPaymentCents: number | null, firstPaymentCents: number, lastPaymentCents: number, totalInterestCents: number, totalPaymentCents: number, rows: Array<{ period: number, paymentCents: number, principalCents: number, interestCents: number, balanceCents: number }> }}
 */
export function calculateLoan(input) {
  assertValidInput(input);
  const { principalCents, annualRatePercent, months, method } = input;

  const result =
    method === 'equal-principal'
      ? calculateEqualPrincipal(principalCents, annualRatePercent, months)
      : calculateEqualPayment(principalCents, annualRatePercent, months);

  for (const row of result.rows) {
    if (
      !Number.isSafeInteger(row.paymentCents) ||
      !Number.isSafeInteger(row.principalCents) ||
      !Number.isSafeInteger(row.interestCents) ||
      !Number.isSafeInteger(row.balanceCents)
    ) {
      throw new RangeError('计划表存在非法数值');
    }
  }

  return result;
}
