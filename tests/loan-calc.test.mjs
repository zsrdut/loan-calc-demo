import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MONTHS,
  calculateLoan,
  roundCents,
  validateLoanInput
} from '../assets/loan-calc.mjs';

const EQUAL_PAYMENT = 'equal-payment';
const EQUAL_PRINCIPAL = 'equal-principal';

function loan(principalYuan, annualRatePercent, months, method) {
  return {
    principalCents: roundCents(principalYuan * 100),
    annualRatePercent,
    months,
    method
  };
}

function sumBy(rows, key) {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function assertScheduleIntegrity(result, expectedPrincipalCents, expectedTotalInterestCents) {
  const { rows } = result;
  assert.equal(rows.length, result.rows.length);
  rows.forEach((row, index) => {
    assert.equal(row.period, index + 1, '期次应连续');
    assert.equal(row.paymentCents, row.principalCents + row.interestCents, '每行月供应等于本金 + 利息');
    assert.ok(Number.isSafeInteger(row.paymentCents));
    assert.ok(Number.isSafeInteger(row.principalCents));
    assert.ok(Number.isSafeInteger(row.interestCents));
    assert.ok(Number.isSafeInteger(row.balanceCents));
  });
  assert.equal(sumBy(rows, 'principalCents'), expectedPrincipalCents, '本金合计应等于贷款金额');
  assert.equal(sumBy(rows, 'interestCents'), expectedTotalInterestCents, '利息合计应等于总利息');
  assert.equal(rows[rows.length - 1].balanceCents, 0, '末期余额应为 0');
  assert.equal(result.totalPaymentCents, expectedPrincipalCents + expectedTotalInterestCents);
}

test('AC-1 等额本息 1,000,000 元 / 4.2% / 360 期', () => {
  const result = calculateLoan(loan(1000000, 4.2, 360, EQUAL_PAYMENT));

  assert.equal(result.method, EQUAL_PAYMENT);
  assert.equal(result.monthlyPaymentCents, 489017);
  assert.equal(result.totalInterestCents, 76046183);
  assert.equal(result.totalPaymentCents, 176046183);
  assert.equal(result.rows.length, 360);

  const first = result.rows[0];
  assert.deepEqual(
    {
      period: first.period,
      paymentCents: first.paymentCents,
      principalCents: first.principalCents,
      interestCents: first.interestCents,
      balanceCents: first.balanceCents
    },
    { period: 1, paymentCents: 489017, principalCents: 139017, interestCents: 350000, balanceCents: 99860983 }
  );

  const second = result.rows[1];
  assert.deepEqual(
    {
      period: second.period,
      paymentCents: second.paymentCents,
      principalCents: second.principalCents,
      interestCents: second.interestCents,
      balanceCents: second.balanceCents
    },
    { period: 2, paymentCents: 489018, principalCents: 139505, interestCents: 349513, balanceCents: 99721478 }
  );

  const last = result.rows[359];
  assert.deepEqual(
    {
      period: last.period,
      paymentCents: last.paymentCents,
      principalCents: last.principalCents,
      interestCents: last.interestCents,
      balanceCents: last.balanceCents
    },
    { period: 360, paymentCents: 489018, principalCents: 487312, interestCents: 1706, balanceCents: 0 }
  );

  assert.equal(result.firstPaymentCents, 489017);
  assert.equal(result.lastPaymentCents, 489018);
  assert.equal(sumBy(result.rows, 'principalCents'), 100000000);
  assert.equal(sumBy(result.rows, 'interestCents'), 76046183);

  const maxDeviation = Math.max(
    ...result.rows.map((row) => Math.abs(row.paymentCents - 489017))
  );
  assert.ok(maxDeviation <= 1, '行月供相对标准月供的偏差应不超过 1 分');

  assertScheduleIntegrity(result, 100000000, 76046183);
});

test('AC-2 等额本金 1,000,000 元 / 4.2% / 360 期', () => {
  const result = calculateLoan(loan(1000000, 4.2, 360, EQUAL_PRINCIPAL));

  assert.equal(result.method, EQUAL_PRINCIPAL);
  assert.equal(result.monthlyPaymentCents, null);
  assert.equal(result.firstPaymentCents, 627778);
  assert.equal(result.lastPaymentCents, 278750);
  assert.equal(result.totalInterestCents, 63175000);
  assert.equal(result.totalPaymentCents, 163175000);
  assert.equal(result.rows.length, 360);

  const first = result.rows[0];
  assert.deepEqual(
    {
      paymentCents: first.paymentCents,
      principalCents: first.principalCents,
      interestCents: first.interestCents,
      balanceCents: first.balanceCents
    },
    { paymentCents: 627778, principalCents: 277778, interestCents: 350000, balanceCents: 99722222 }
  );

  const second = result.rows[1];
  assert.deepEqual(
    {
      paymentCents: second.paymentCents,
      principalCents: second.principalCents,
      interestCents: second.interestCents,
      balanceCents: second.balanceCents
    },
    { paymentCents: 626805, principalCents: 277777, interestCents: 349028, balanceCents: 99444445 }
  );

  const last = result.rows[359];
  assert.deepEqual(
    {
      paymentCents: last.paymentCents,
      principalCents: last.principalCents,
      interestCents: last.interestCents,
      balanceCents: last.balanceCents
    },
    { paymentCents: 278750, principalCents: 277778, interestCents: 972, balanceCents: 0 }
  );

  for (let i = 0; i < result.rows.length - 1; i += 1) {
    assert.ok(
      result.rows[i].paymentCents >= result.rows[i + 1].paymentCents,
      '等额本金月供应逐期递减'
    );
  }

  assert.equal(sumBy(result.rows, 'principalCents'), 100000000);
  assert.equal(sumBy(result.rows, 'interestCents'), 63175000);
  assertScheduleIntegrity(result, 100000000, 63175000);
});

test('AC-5 500,000 元 / 3.6% / 240 期：等额本息', () => {
  const result = calculateLoan(loan(500000, 3.6, 240, EQUAL_PAYMENT));

  assert.equal(result.monthlyPaymentCents, 292556);
  assert.equal(result.totalInterestCents, 20213376);
  assert.equal(result.totalPaymentCents, 70213376);
  assert.equal(result.rows.length, 240);

  const first = result.rows[0];
  assert.deepEqual(
    {
      paymentCents: first.paymentCents,
      principalCents: first.principalCents,
      interestCents: first.interestCents,
      balanceCents: first.balanceCents
    },
    { paymentCents: 292556, principalCents: 142556, interestCents: 150000, balanceCents: 49857444 }
  );

  const last = result.rows[239];
  assert.deepEqual(
    {
      paymentCents: last.paymentCents,
      principalCents: last.principalCents,
      interestCents: last.interestCents,
      balanceCents: last.balanceCents
    },
    { paymentCents: 292556, principalCents: 291681, interestCents: 875, balanceCents: 0 }
  );

  assert.equal(sumBy(result.rows, 'principalCents'), 50000000);
  assert.equal(sumBy(result.rows, 'interestCents'), 20213376);
  assertScheduleIntegrity(result, 50000000, 20213376);
});

test('AC-5 500,000 元 / 3.6% / 240 期：等额本金', () => {
  const result = calculateLoan(loan(500000, 3.6, 240, EQUAL_PRINCIPAL));

  assert.equal(result.monthlyPaymentCents, null);
  assert.equal(result.firstPaymentCents, 358333);
  assert.equal(result.lastPaymentCents, 208958);
  assert.equal(result.totalInterestCents, 18075000);
  assert.equal(result.totalPaymentCents, 68075000);
  assert.equal(result.rows.length, 240);

  const first = result.rows[0];
  assert.deepEqual(
    {
      paymentCents: first.paymentCents,
      principalCents: first.principalCents,
      interestCents: first.interestCents,
      balanceCents: first.balanceCents
    },
    { paymentCents: 358333, principalCents: 208333, interestCents: 150000, balanceCents: 49791667 }
  );

  const last = result.rows[239];
  assert.deepEqual(
    {
      paymentCents: last.paymentCents,
      principalCents: last.principalCents,
      interestCents: last.interestCents,
      balanceCents: last.balanceCents
    },
    { paymentCents: 208958, principalCents: 208333, interestCents: 625, balanceCents: 0 }
  );

  assert.equal(sumBy(result.rows, 'principalCents'), 50000000);
  assert.equal(sumBy(result.rows, 'interestCents'), 18075000);
  assertScheduleIntegrity(result, 50000000, 18075000);
});

test('AC-4 两种还款方式结果不同且不混用', () => {
  const input = loan(1000000, 4.2, 360, EQUAL_PAYMENT);
  const equalPayment = calculateLoan(input);
  const equalPrincipal = calculateLoan({ ...input, method: EQUAL_PRINCIPAL });

  assert.equal(equalPayment.method, EQUAL_PAYMENT);
  assert.equal(equalPrincipal.method, EQUAL_PRINCIPAL);
  assert.notEqual(equalPayment.monthlyPaymentCents, null);
  assert.equal(equalPrincipal.monthlyPaymentCents, null);
  assert.ok(equalPrincipal.firstPaymentCents > equalPrincipal.lastPaymentCents);

  equalPayment.rows.forEach((row) => {
    assert.ok(Math.abs(row.paymentCents - equalPayment.monthlyPaymentCents) <= 2);
  });

  assert.notDeepEqual(equalPayment.rows, equalPrincipal.rows);
});

test('AC-7 零利率 360,000 元 / 0% / 360 期', () => {
  for (const method of [EQUAL_PAYMENT, EQUAL_PRINCIPAL]) {
    const result = calculateLoan(loan(360000, 0, 360, method));

    assert.equal(result.totalInterestCents, 0);
    assert.equal(result.totalPaymentCents, 36000000);
    assert.equal(result.rows.length, 360);
    assert.equal(result.rows[0].paymentCents, 100000);
    assert.equal(result.rows[0].principalCents, 100000);
    assert.equal(result.rows[0].interestCents, 0);
    assert.equal(result.rows[359].balanceCents, 0);
    assert.ok(result.rows.every((row) => row.paymentCents === 100000));
    assert.ok(result.rows.every((row) => row.interestCents === 0));
    assertScheduleIntegrity(result, 36000000, 0);
  }

  const equalPayment = calculateLoan(loan(360000, 0, 360, EQUAL_PAYMENT));
  const equalPrincipal = calculateLoan(loan(360000, 0, 360, EQUAL_PRINCIPAL));
  assert.equal(equalPayment.monthlyPaymentCents, 100000);
  assert.equal(equalPrincipal.firstPaymentCents, 100000);
  assert.equal(equalPrincipal.lastPaymentCents, 100000);
});

test('AC-8 单期 1,000,000 元 / 4.2% / 1 期', () => {
  for (const method of [EQUAL_PAYMENT, EQUAL_PRINCIPAL]) {
    const result = calculateLoan(loan(1000000, 4.2, 1, method));

    assert.equal(result.rows.length, 1);
    assert.deepEqual(
      {
        paymentCents: result.rows[0].paymentCents,
        principalCents: result.rows[0].principalCents,
        interestCents: result.rows[0].interestCents,
        balanceCents: result.rows[0].balanceCents
      },
      { paymentCents: 100350000, principalCents: 100000000, interestCents: 350000, balanceCents: 0 }
    );
    assert.equal(result.totalInterestCents, 350000);
    assert.equal(result.totalPaymentCents, 100350000);
    assert.equal(result.firstPaymentCents, 100350000);
    assert.equal(result.lastPaymentCents, 100350000);
    assertScheduleIntegrity(result, 100000000, 350000);
  }
});

test('AC-6 输入校验：金额', () => {
  const base = { rateText: '4.2', monthsText: '360' };

  assert.equal(validateLoanInput({ ...base, amountText: '' }).errors.amount, '请输入贷款金额');
  assert.equal(validateLoanInput({ ...base, amountText: '   ' }).errors.amount, '请输入贷款金额');
  assert.equal(validateLoanInput({ ...base, amountText: '0' }).errors.amount, '贷款金额必须大于 0');
  assert.equal(validateLoanInput({ ...base, amountText: '-100' }).errors.amount, '贷款金额必须大于 0');
  assert.equal(
    validateLoanInput({ ...base, amountText: 'abc' }).errors.amount,
    '请输入有效的贷款金额（正数，最多两位小数）'
  );
  assert.equal(
    validateLoanInput({ ...base, amountText: '1.234' }).errors.amount,
    '请输入有效的贷款金额（正数，最多两位小数）'
  );
  assert.equal(
    validateLoanInput({ ...base, amountText: '1000000000000.01' }).errors.amount,
    '贷款金额超出可计算范围'
  );

  const failed = validateLoanInput({ ...base, amountText: 'abc' });
  assert.equal(failed.ok, false);
  assert.equal(failed.values, undefined);
});

test('AC-6 输入校验：年利率', () => {
  const base = { amountText: '1000000', monthsText: '360' };

  assert.equal(validateLoanInput({ ...base, rateText: '' }).errors.rate, '请输入年利率');
  assert.equal(validateLoanInput({ ...base, rateText: '-1' }).errors.rate, '年利率不能为负数');
  assert.equal(
    validateLoanInput({ ...base, rateText: 'abc' }).errors.rate,
    '请输入有效的年利率（百分数，如 4.2）'
  );
});

test('AC-6 输入校验：贷款期限', () => {
  const base = { amountText: '1000000', rateText: '4.2' };

  assert.equal(validateLoanInput({ ...base, monthsText: '' }).errors.months, '请输入贷款期限');
  assert.equal(validateLoanInput({ ...base, monthsText: '0' }).errors.months, '贷款期限至少为 1 期');
  assert.equal(
    validateLoanInput({ ...base, monthsText: '-12' }).errors.months,
    '贷款期限必须为正整数（月）'
  );
  assert.equal(
    validateLoanInput({ ...base, monthsText: '1.5' }).errors.months,
    '贷款期限必须为正整数（月）'
  );
  assert.equal(
    validateLoanInput({ ...base, monthsText: 'abc' }).errors.months,
    '贷款期限必须为正整数（月）'
  );
  assert.equal(
    validateLoanInput({ ...base, monthsText: String(MAX_MONTHS + 1) }).errors.months,
    '贷款期限最长为 ' + MAX_MONTHS + ' 期'
  );
});

test('AC-6 输入校验：合法输入清洗千分位与空格', () => {
  const fromComma = validateLoanInput({
    amountText: '1,000,000',
    rateText: '4.2',
    monthsText: '360',
    method: EQUAL_PAYMENT
  });
  assert.equal(fromComma.ok, true);
  assert.deepEqual(fromComma.errors, {});
  assert.equal(fromComma.values.principalCents, 100000000);
  assert.equal(fromComma.values.annualRatePercent, 4.2);
  assert.equal(fromComma.values.months, 360);
  assert.equal(fromComma.values.method, EQUAL_PAYMENT);

  const fromSpace = validateLoanInput({
    amountText: ' 500 000 ',
    rateText: '3.6',
    monthsText: '240'
  });
  assert.equal(fromSpace.ok, true);
  assert.equal(fromSpace.values.principalCents, 50000000);
  assert.equal(fromSpace.values.method, EQUAL_PAYMENT, '缺失方式时默认等额本息');

  const withCents = validateLoanInput({
    amountText: '1234.56',
    rateText: '0',
    monthsText: '12'
  });
  assert.equal(withCents.ok, true);
  assert.equal(withCents.values.principalCents, 123456);

  const allErrors = validateLoanInput({
    amountText: '',
    rateText: '',
    monthsText: ''
  });
  assert.equal(allErrors.ok, false);
  assert.deepEqual(Object.keys(allErrors.errors).sort(), ['amount', 'months', 'rate']);
});

test('防御性：calculateLoan 拒绝非法输入', () => {
  assert.throws(() => calculateLoan(null), TypeError);
  assert.throws(
    () => calculateLoan({ principalCents: 0, annualRatePercent: 4.2, months: 360, method: EQUAL_PAYMENT }),
    TypeError
  );
  assert.throws(
    () => calculateLoan({ principalCents: 100, annualRatePercent: -1, months: 360, method: EQUAL_PAYMENT }),
    TypeError
  );
  assert.throws(
    () => calculateLoan({ principalCents: 100, annualRatePercent: 4.2, months: 0, method: EQUAL_PAYMENT }),
    TypeError
  );
  assert.throws(
    () => calculateLoan({ principalCents: 100, annualRatePercent: 4.2, months: 360, method: 'other' }),
    TypeError
  );
});

test('防御性：极端但合法输入不产生 NaN / Infinity', () => {
  const cases = [
    loan(1000000000000, 4.2, 1200, EQUAL_PAYMENT),
    loan(1000000000000, 4.2, 1200, EQUAL_PRINCIPAL),
    loan(0.01, 4.2, 1200, EQUAL_PAYMENT),
    loan(0.01, 4.2, 1200, EQUAL_PRINCIPAL),
    loan(100, 0.0001, 1200, EQUAL_PAYMENT),
    loan(100, 0.0001, 1200, EQUAL_PRINCIPAL),
    loan(1, 99.99, 1, EQUAL_PAYMENT)
  ];

  for (const input of cases) {
    const result = calculateLoan(input);
    assert.ok(Number.isFinite(result.totalInterestCents));
    assert.ok(Number.isFinite(result.totalPaymentCents));
    assert.ok(Number.isFinite(result.firstPaymentCents));
    assert.ok(Number.isFinite(result.lastPaymentCents));
    assert.equal(result.rows.length, input.months);
    assert.equal(result.rows[result.rows.length - 1].balanceCents, 0);
    assert.equal(sumBy(result.rows, 'principalCents'), input.principalCents);
    assert.equal(sumBy(result.rows, 'interestCents'), result.totalInterestCents);
  }
});
