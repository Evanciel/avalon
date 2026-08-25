<div align="center">

<img src="images/banner.svg" alt="Avalon — 用图来声明，让数字来裁决" width="100%" />

**面向 AI 智能体的图工程 — 一套完整的执行框架，和骗不了自己的循环。**<br/>
在开工之前就把通过条件钉成数字，裁决交给工具，而不是 AI 自己。

[![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-124%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文**

</div>

## 解决什么问题

把一个大任务交给 AI 智能体，最后它会说"完成了"。问题在于:说这话的和检查这话的是同一个 AI。就像考生给自己阅卷 — 有遗漏也没人发现。

当你让 AI 跑循环时(通宵自动干活、不通过就重试),问题更严重。如果裁决标准不在智能体外部,循环就会一边骗自己一边心情愉快地转下去。

Avalon 把顺序反过来。在开工**之前**,先把计划画成一张图:节点是要做的事,边是顺序,门是通过条件 — 而且门里**只能写数字**。裁决由一组小工具来做。这些工具从不调用 LLM,所以同一张图永远得到同一个裁决。

<img src="images/who-judges.svg" alt="没有 Avalon 时智能体给自己打分。有了 Avalon,智能体提交测量值,由确定性工具给出裁决。" width="100%" />

活儿还是智能体全干 — 它只是失去了给自己打分的权利。

## 框架里有什么

| 组件 | 做什么 |
|---|---|
| **图 (JSON IR)** | 计划本身。一个门就是 `字段 + 运算符 + 数字` — 根本没有地方写"检查一下效果好不好"这种话 |
| **验证器** | 6 项静态检查:不可达节点、无限循环、没有预算的节点、缺少审批的不可逆步骤、断裂的边、白名单之外的字段 |
| **编译器** | 把图翻译成可执行的工作流脚本。哪怕有一个门在翻译中丢失,就拒绝编译 (`gate_loss`) |
| **运行器** | 在执行时强制顺序。不能跳序启动节点,不能不测量就完成节点,每次测量都记入只增不改的台账 |
| **钩子规格** | 输出 `build/hooks.json`,让门也能从会话**外部**被强制执行。声明了钩子却没有真实命令,会被 `hook_loss` 抓住 |

## 一次运行的流程

<img src="images/pipeline.svg" alt="1 scaffold 实测仓库,2 design 是人的判断,3 validate 和 compile 检查四个数字,4 run 强制顺序并写入台账" width="100%" />

四步里两步是机器,一步是你,还有一步是盯着你的机器。判断只在第 2 步进场 — 决定节点和门该是什么的那一刻。它周围的一切都是确定性的,这正是重点:你的判断只以数字的形式记录一次,之后没有任何人能凭感觉重新裁决。

## 快速开始

```bash
git clone https://github.com/Evanciel/avalon && cd avalon
npm test        # 124 个测试,零依赖,Node 18+
```

```bash
# 1. 实测目标仓库,生成一个已经通过验证的骨架
node tools/scaffold.mjs <目标路径> "一句话描述任务" graph.json

# 2. 把 TODO 换成真实的节点和门(这一步是判断 — 归你)

# 3. 盖章 → 验证 → 编译
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js

# 4. 用运行器执行
node tools/run.mjs graph.json init
node tools/run.mjs graph.json next
node tools/run.mjs graph.json start <节点>
node tools/run.mjs graph.json measure <字段> <值>
node tools/run.mjs graph.json done <节点>     # 通过与否由工具决定,不由你
```

### 一发到底:作为技能运行

上面的命令是手动路径。这个仓库同时也是一个 Claude Code 技能([SKILL.md](SKILL.md) 是入口),而技能才是本来预期的用法 — 你只说目标,剩下的交给智能体:

1. 对目标仓库运行 `scaffold` 实测。
2. 把工作拆成节点、写好门。这是判断步骤 — 草稿由智能体起草,对结果的否决权在验证器手里。
3. 盖章 → 验证 → 编译,把四个数字全部变绿。
4. 执行:编译出的工作流为每个节点分配一个子智能体,节点之间的每次交接都要过数字门。(或者由智能体直接驾驶运行器 CLI,边干边记录测量值。)

它会自己跑到完成为止,只有两个例外 — 而这两个例外正是这个技能存在的意义:不可逆的步骤会停下来等人审批;被放弃的门留在 `abandoned[]` 里,智能体无法悄悄拍板"差不多得了"。

### 门长什么样

一个门就是一个 JSON 对象。没有自由文本字段,所以不存在"宽松解读"的空间:

```jsonc
{
  "id": "G1",
  "field": "tests_failed",          // 必须在 state[] 中声明 — 未知字段直接拒绝
  "op": "==",
  "threshold": 0,
  "on_fail": { "goto": "fix", "max_retry": 2 },
  "ground_truth": "measured",
  "threshold_source": "为什么是这个数 — 逼你把依据白纸黑字写一次"
}
```

执行 `done` 时,工具读取 `tests_failed` 的最新测量值,应用 `== 0`,给出通过或不通过。对阈值有异议,请在运行前提;运行中没有任何渠道对裁决讨价还价。

### 运行器拒绝什么

运行器本质上是一份"不许发生的事"清单,来自四条不变式(INV-1 到 INV-4,见 [run.mjs](tools/run.mjs)):

| 你尝试 | 运行器的回答 |
|---|---|
| `start` 一个还没轮到的节点 | 拒绝 — 并列出你现在*可以*启动的节点 |
| 本次访问没有新测量就 `done` | 拒绝 — 旧测量值不结转,过期的绿灯混不过重试 |
| `measure` 一个图里从未声明的字段 | 拒绝 — 测量未声明的字段,不过是走了流程的瞎猜 |
| `init` 之后改图继续跑 | 标记 **STALE** — 状态记得自己是从哪个图哈希生出来的 |
| 门失败次数超过 `max_retry` | **停机** — 运行停止,决定权交还给人 |

每条被接受的测量都追加到 `state.ledger.jsonl`。台账永不改写,连 `init --force` 也会保留它。

**运行之前,四个数字必须全绿:**

| | 通过条件 | 含义 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 所有必填字段都已填写 |
| `static_checks_passed` | 6/6 | 图的结构没有问题 |
| `gate_loss` | 0 | 声明的每个门都进入了编译后的代码 |
| `hook_loss` | 0 | 声明的每个钩子背后都有真实命令 |

如果某个 loss 不为零,说明存在"只有声明、无人强制"的东西。那样的图是装饰品,工具会用非零退出码直说。

## 规则从哪里来

这些规则不是在白板上设计出来的。每一条都源自真实漏过去的 bug,同一*类* bug 重复出现时,就给它编号:

| # | 发生了什么 | 现在靠什么防住 |
|---|---|---|
| 1 | 有一项永远不可能失败的检查 — 它重复询问另一项检查已经强制的条件 | 把检查重写为真正能打断循环的条件 |
| 2 | 项目指纹被测量并存进了 IR……却一个字也没进过提示词 | 共享上下文块 + 回归测试 |
| 3 | IR 里没有"哪个仓库、什么任务"的字段 — 编译出的智能体蒙着眼开工 | `target`、`task` 设为必填,缺失即拒绝编译 |
| 4 | "需要审批"的声明通过了验证,编译器却悄悄丢掉了它 — 不可逆的 `git push` 编译后畅通无阻 | 审批门直接输出进代码 + 回归测试 |
| 5 | 钩子强制写进了 IR,各项检查全绿 — 但钩子文件从来就不存在 | 声明必须携带可执行命令,缺口由 `hook_loss` 来数 |

共同的模式只有一个:**声明先被验证,然后被丢弃。** loss 指标的存在,就是让这类 bug 无法被忽略。

## 放弃不等于成功

<img src="images/abandon.svg" alt="重试耗尽的门会把证据留在 abandoned[] 里,只要该列表非空,最终的 completed 就被强制为 false" width="100%" />

当一个门耗尽重试、且配置为 `on_exhaust: partial` 时,工作流会继续前进 — 但会把 `{门, 实测值, 阈值, 尝试次数}` 记入 `abandoned[]` 列表,而只要这个列表非空,最终的 `completed` 标志就被**强制置为 false**。跳过了门的运行,没有任何办法把自己上报为成功。这一点由真正执行编译产物的语义测试钉死。

## 仓库地图

```
SKILL.md                 技能入口 — 流程与纪律
graph.json / graph.md    自我应用的图(JSON 为正本,md 是渲染产物)
tools/
  scaffold.mjs           实测仓库 → 生成绿色骨架
  hash.mjs               canonical JSON + sha256 盖章
  validate.mjs           6 项静态检查 + 模式版本管理
  render.mjs             JSON → markdown(--check 为逐字节比对)
  compile.mjs            IR → 工作流脚本 + hooks.json(从不调用 LLM)
  run.mjs                运行器 — 前沿集、测量台账、门裁决
  test.mjs               模式 / 编译器 / 执行语义测试(88 个)
  run.selftest.mjs       运行器自检 — "删掉守卫会变红吗"(36 个)
docs/graph/              设计史、IR 规格、上述伤疤的原始记录
```

## 诚实的边界

- 工具只能证明**声明了的判据**。check 命令和它的人类语言标题是否同一个意思,仍然要靠人看。
- `build/hooks.json` 只是规格。在被安装之前(单独的、需审批的步骤),它不会拦截任何东西。
- 智能体节点在运行时产生的产物,无法在编译期比对。

完整的当前清单在自我应用图的 `guarantees` 块里。

## 许可证

[MIT](LICENSE)
