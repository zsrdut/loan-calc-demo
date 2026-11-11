# 贷款月供试算器

纯前端、零构建的单页贷款月供试算工具，支持等额本息与等额本金两种还款方式，展示汇总指标与逐月还款计划表。

## 本地运行

仓库根目录即站点根目录，无需安装依赖：

```bash
python3 -m http.server 4173
# 打开 http://127.0.0.1:4173/
```

## 运行测试

需要 Node.js 20 及以上版本（使用内置 `node:test`，无第三方依赖）：

```bash
node --check assets/loan-calc.mjs
node --test tests/loan-calc.test.mjs
```

## 目录结构

```text
index.html                 页面入口（中文标题/H1 含“月供”）
assets/styles.css          全部样式（淡蓝色主题，CSS 变量集中配色）
assets/loan-calc.mjs       纯计算与校验模块（无 DOM、无网络）
assets/app.mjs             表单读取、校验、渲染与事件绑定
tests/loan-calc.test.mjs   node:test 单元测试（数值夹具与边界）
api/fact-check.js          平台外部检查端点，保持原样，不修改
```

## 计算口径

- 金额内部以“分”为单位（安全整数），展示统一两位小数、千分位。
- 年利率为百分数，`4.2` 表示 4.2%；月利率 = 年利率 / 100 / 12。
- 汇总取标准公式值（四舍五入到分）；逐月计划表逐行取整后做 1 分钱级别的尾差校正，保证本金合计等于贷款金额、利息合计等于总利息、每行月供等于本金加利息、末期剩余本金为 0。
- 因此个别中间期次的月供可能与标准月供相差 0.01 元，属于分位尾差。

## 部署形态

静态站点，无构建、无运行时依赖。Vercel 使用 Framework Preset = Other、Build Command 留空、Output Directory 为仓库根目录；不添加 `vercel.json` 重写，保留 `/api/fact-check`。
