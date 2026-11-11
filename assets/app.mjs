// 页面控制器：读取表单、调用校验与计算、渲染汇总与计划表。
import { calculateLoan, validateLoanInput } from './loan-calc.mjs';

const FIELD_LABELS = {
  amount: '贷款金额',
  rate: '年利率',
  months: '贷款期限'
};

const METHOD_LABELS = {
  'equal-payment': '等额本息',
  'equal-principal': '等额本金'
};

const form = document.getElementById('loan-form');
const amountInput = document.getElementById('amount');
const rateInput = document.getElementById('rate');
const monthsInput = document.getElementById('months');
const methodInputs = Array.from(document.querySelectorAll('input[name="method"]'));
const methodOptions = Array.from(document.querySelectorAll('.method-option'));
const formErrors = document.getElementById('form-errors');
const formHint = document.getElementById('form-hint');
const resultSection = document.getElementById('result');
const summaryEl = document.getElementById('summary');
const scheduleBody = document.getElementById('schedule-body');
const tableCaptionText = document.getElementById('table-caption-text');
const monthsHint = document.getElementById('months-hint');

function sanitizeNumericText(text) {
  return String(text == null ? '' : text).replace(/[,，\s]/g, '');
}

function formatMoney(cents) {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatYears(months) {
  const years = months / 12;
  return Number.isInteger(years) ? String(years) : years.toFixed(1);
}

function selectedMethod() {
  const checked = methodInputs.find((input) => input.checked);
  return checked ? checked.value : 'equal-payment';
}

function readForm() {
  return {
    amountText: amountInput.value,
    rateText: rateInput.value,
    monthsText: monthsInput.value,
    method: selectedMethod()
  };
}

function fieldElements(field) {
  const input = field === 'amount' ? amountInput : field === 'rate' ? rateInput : monthsInput;
  return {
    input,
    error: document.getElementById(field + '-error')
  };
}

function clearFieldError(field) {
  const { input, error } = fieldElements(field);
  input.removeAttribute('aria-invalid');
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
}

function clearAllErrors() {
  Object.keys(FIELD_LABELS).forEach(clearFieldError);
  formErrors.textContent = '';
  formErrors.hidden = true;
}

function renderErrors(errors) {
  const messages = [];
  Object.keys(FIELD_LABELS).forEach((field) => {
    const message = errors[field];
    const { input, error } = fieldElements(field);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      if (error) {
        error.textContent = message;
        error.hidden = false;
      }
      messages.push(FIELD_LABELS[field] + '：' + message);
    } else {
      clearFieldError(field);
    }
  });

  if (errors.form) {
    messages.push(errors.form);
  }

  if (messages.length > 0) {
    const list = document.createElement('ul');
    messages.forEach((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      list.appendChild(item);
    });
    formErrors.textContent = '';
    formErrors.appendChild(list);
    formErrors.hidden = false;
  } else {
    formErrors.textContent = '';
    formErrors.hidden = true;
  }
}

function updateMethodStyles() {
  const current = selectedMethod();
  methodOptions.forEach((option) => {
    option.classList.toggle('is-checked', option.dataset.method === current);
  });
}

function updateMonthsHint() {
  const text = sanitizeNumericText(monthsInput.value);
  if (/^\d+$/.test(text) && Number(text) > 0) {
    monthsHint.textContent = '按整月输入，约 ' + formatYears(Number(text)) + ' 年';
  } else {
    monthsHint.textContent = '按整月输入';
  }
}

function clearResult() {
  resultSection.hidden = true;
  summaryEl.textContent = '';
  scheduleBody.textContent = '';
  tableCaptionText.textContent = '';
}

function showHint() {
  formHint.hidden = false;
}

function hideHint() {
  formHint.hidden = true;
}

function appendSummaryCard(label, value, note, primary) {
  const card = document.createElement('div');
  card.className = primary ? 'summary-card summary-card--primary' : 'summary-card';

  const labelEl = document.createElement('p');
  labelEl.className = 'summary-card__label';
  labelEl.textContent = label;

  const valueEl = document.createElement('p');
  valueEl.className = 'summary-card__value';
  valueEl.textContent = value;

  card.appendChild(labelEl);
  card.appendChild(valueEl);

  if (note) {
    const noteEl = document.createElement('p');
    noteEl.className = 'summary-card__note';
    noteEl.textContent = note;
    card.appendChild(noteEl);
  }

  summaryEl.appendChild(card);
}

function renderSummary(result, values) {
  summaryEl.textContent = '';
  const methodLabel = METHOD_LABELS[result.method];

  if (result.method === 'equal-payment') {
    appendSummaryCard('每月月供', formatMoney(result.monthlyPaymentCents) + ' 元', methodLabel + ' · ' + values.months + ' 期', true);
  } else {
    appendSummaryCard('首期月供', formatMoney(result.firstPaymentCents) + ' 元', methodLabel + ' · 逐期递减', true);
    appendSummaryCard('末期月供', formatMoney(result.lastPaymentCents) + ' 元', '第 ' + values.months + ' 期');
  }

  appendSummaryCard('总利息', formatMoney(result.totalInterestCents) + ' 元', '全周期利息合计');
  appendSummaryCard('总还款额', formatMoney(result.totalPaymentCents) + ' 元', '本金 + 利息');
}

function renderSchedule(result, values) {
  const fragment = document.createDocumentFragment();
  result.rows.forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [
      String(row.period),
      formatMoney(row.paymentCents),
      formatMoney(row.principalCents),
      formatMoney(row.interestCents),
      formatMoney(row.balanceCents)
    ];
    cells.forEach((text, index) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (index > 0) {
        td.className = 'num';
      }
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  scheduleBody.textContent = '';
  scheduleBody.appendChild(fragment);

  const rateText = String(values.annualRatePercent);
  tableCaptionText.textContent =
    METHOD_LABELS[result.method] +
    ' · 贷款 ' + formatMoney(values.principalCents) + ' 元' +
    ' · 年利率 ' + rateText + '%' +
    ' · ' + values.months + ' 期（约 ' + formatYears(values.months) + ' 年）';
}

function renderResult(result, values) {
  renderSummary(result, values);
  renderSchedule(result, values);
  resultSection.hidden = false;
  hideHint();
}

function runCalculation(values) {
  try {
    const result = calculateLoan(values);
    clearAllErrors();
    renderResult(result, values);
  } catch (error) {
    clearResult();
    renderErrors({ form: '计算失败，请检查输入后重试' });
  }
}

function validateAndRender() {
  const raw = readForm();
  const validation = validateLoanInput(raw);
  if (!validation.ok) {
    renderErrors(validation.errors);
    clearResult();
    hideHint();
    focusFirstError(validation.errors);
    return;
  }
  runCalculation(validation.values);
}

function focusFirstError(errors) {
  const order = ['amount', 'rate', 'months'];
  const first = order.find((field) => errors[field]);
  if (!first) return;
  fieldElements(first).input.focus();
}

function handleSubmit(event) {
  event.preventDefault();
  validateAndRender();
}

function handleInputChange(field) {
  clearFieldError(field);
  formErrors.textContent = '';
  formErrors.hidden = true;
  clearResult();
  showHint();
  if (field === 'months') {
    updateMonthsHint();
  }
}

function handleMethodChange() {
  updateMethodStyles();
  const validation = validateLoanInput(readForm());
  if (!validation.ok) {
    renderErrors(validation.errors);
    clearResult();
    hideHint();
    return;
  }
  runCalculation(validation.values);
}

function init() {
  updateMethodStyles();
  updateMonthsHint();

  amountInput.addEventListener('input', () => handleInputChange('amount'));
  rateInput.addEventListener('input', () => handleInputChange('rate'));
  monthsInput.addEventListener('input', () => handleInputChange('months'));
  methodInputs.forEach((input) => input.addEventListener('change', handleMethodChange));
  form.addEventListener('submit', handleSubmit);

  // 首屏按默认示例自动试算
  validateAndRender();
}

init();
