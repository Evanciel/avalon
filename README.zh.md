<div align="center">

<img src="images/banner.svg" alt="Avalon — 用图来声明，让数字来裁决" width="100%" />

**面向 AI 智能体的图工程 — 一套完整的执行框架，和骗不了自己的循环。**<br/>
在开工之前就把通过条件钉成数字，裁决交给工具，而不是 AI 自己。

[![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-136%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文**

</div>

- [解决什么问题](#解决什么问题)
- [写给谁用](#写给谁用)
- [框架里有什么](#框架里有什么)
- [四个阶段](#四个阶段)
- [一次运行的流程](#一次运行的流程)
- [安装](#安装)
- [三种运行方式](#三种运行方式)
- [教程:真刀真枪跑一遍](#教程真刀真枪跑一遍)
- [图的格式](#图的格式)
- [四个数字](#四个数字)
- [逐个工具讲](#逐个工具讲)
- [规则从哪里来](#规则从哪里来)
- [设计的书面痕迹](#设计的书面痕迹)
- [放弃不等于成功](#放弃不等于成功)
- [钩子:规格不等于安装](#钩子规格不等于安装)
- [Avalon 跑在 Avalon 上](#avalon-跑在-avalon-上)
- [怎么测试的](#怎么测试的)
- [仓库地图](#仓库地图)
- [诚实的边界](#诚实的边界)

## 解决什么问题

把一个大任务交给 AI 智能体,最后它会说"完成了"。问题在于:说这话的和检查这话的是同一个 AI。就像考生给自己阅卷 — 有遗漏也没人发现。

当你让 AI 跑循环时(通宵自动干活、不通过就重试),问题更严重。如果裁决标准不在智能体外部,循环就会一边骗自己一边心情愉快地转下去。

Avalon 把顺序反过来。在开工**之前**,先把计划画成一张图:节点是要做的事,边是顺序,门是通过条件 — 而且门里**只能写数字**。裁决由一组小工具来做。这些工具从不调用 LLM,所以同一张图永远得到同一个裁决。

<img src="images/who-judges.svg" alt="没有 Avalon 时智能体给自己打分。有了 Avalon,智能体提交测量值,由确定性工具给出裁决。" width="100%" />

活儿还是智能体全干 — 它只是失去了给自己打分的权利。

## 写给谁用

- **把大活交给智能体的人。** 四个以上文件、跨多个模块、混着难以回退的步骤。任务越大,"完成了"能藏住的窟窿就越大。
- **通宵无人值守跑循环的人。** 不通过就重试的自动循环。裁判不在智能体外部,循环就会一边骗自己一边迎来早晨。
- **被"完成了"坑过的人。** 一次就够了吧。写给所有不再相信没有证据的成功报告的人。

改一两个文件的小活别用它 — 画计划的成本超过活本身,就是本末倒置。

**你得到什么:**

| 承诺 | 怎么兑现 |
|---|---|
| 假成功不可能 | 跳过门的运行没有任何办法把自己上报为成功 — 真正执行编译产物的测试证明了这一点 |
| 放弃会留下记录 | 尝试次数和实测值都在案。没有"差不多得了" |
| 裁决不漂移 | 裁决工具从不调用 LLM。同一张图,同一个裁决 — 情绪和说服都不管用 |

## 框架里有什么

| 组件 | 做什么 |
|---|---|
| **图 (JSON IR)** | 计划本身。一个门就是 `字段 + 运算符 + 数字` — 根本没有地方写"检查一下效果好不好"这种话 |
| **验证器** | 必填字段全量检查(G0) + 6 项静态检查 + 在表达层面就拒绝描述性门的模式 |
| **编译器** | 把图翻译成可执行的多智能体工作流。哪怕有一个门在翻译中丢失,就拒绝编译 (`gate_loss`) |
| **运行器** | 在执行时强制顺序。不能跳序启动节点,不能不测量就完成节点,每次测量都记入只增不改的台账 |
| **钩子规格 + 安装器** | 输出 `build/hooks.json`,让门也能从会话**外部**被强制执行 — 再由带审批门的安装器把它作为 Stop 钩子接进项目 settings。声明了钩子却没有真实命令,会被 `hook_loss` 抓住 |
| **脚手架** | 实测目标仓库,生成一个已经通过验证的骨架 — 从绿色开始,保持绿色 |

## 四个阶段

Avalon 的架构是四个阶段,这个仓库里的工具就是它们的实现:

| 阶段 | 角色 | 实现 |
|---|---|---|
| **① FRONTEND** | 声明 — 实测仓库、写出 IR | `scaffold.mjs` + 人/模型的判断,否决权在 `validate.mjs` |
| **② BACKEND** | 编译 — 无损翻译,否则拒绝 | `compile.mjs`(`gate_loss`、`hook_loss`、审批停机、钩子规格) |
| **③ DRIVER** | 执行 — 在数字门之下驱动到完成 | `run.mjs`,或在编排宿主上运行的编译产物 |
| **④ ARCHIVE** | 积累 — 完成的运行变成案例,回流到设计 | **刻意休眠** — 在前提条件(针对对抗性输入的威胁模型)满足之前保持关闭。还不安全的阶段就声明为休眠,而不是偷偷跑一半 |

阶段之间的边界才是承重的部分:判断只在①进场,②要么无损要么拒绝,③只执行不裁决,④现在还不被允许存在。每条边界背后都至少有一道伤疤(见[规则从哪里来](#规则从哪里来))。

## 一次运行的流程

<img src="images/pipeline.svg" alt="1 scaffold 实测仓库,2 design 是人的判断,3 validate 和 compile 检查四个数字,4 run 强制顺序并写入台账" width="100%" />

四步里两步是机器,一步是你,还有一步是盯着你的机器。判断只在第 2 步进场 — 决定节点和门该是什么的那一刻。它周围的一切都是确定性的,这正是重点:你的判断只以数字的形式记录一次,之后没有任何人能凭感觉重新裁决。

## 安装

```bash
git clone https://github.com/Evanciel/avalon && cd avalon
npm test        # 136 个测试,零依赖,Node 18+
```

要作为 **Claude Code 技能**使用,克隆到技能目录即可 — [SKILL.md](SKILL.md) 的 frontmatter(`name: avalon`)负责注册:

```bash
git clone https://github.com/Evanciel/avalon ~/.claude/skills/avalon
```

之后一句"用 avalon 来推进"就能加载整套流程。没有安装步骤、没有依赖 — 工具就是 6 个独立的 `.mjs` 文件。

## 三种运行方式

### ① 一发到底,作为技能 — 预期用法

你只说目标,剩下的交给智能体:

1. 对目标仓库运行 `scaffold` 实测。
2. 把工作拆成节点、写好门。这是判断步骤 — 草稿由智能体起草,否决权在验证器手里。
3. 盖章 → 验证 → 编译,把[四个数字](#四个数字)全部变绿。
4. 执行编译出的工作流:每个节点一个子智能体,每次交接都过数字门,直到整张图完成。

它会自己跑到完成为止,只有两个例外 — 而这两个例外正是这个技能存在的意义:不可逆的步骤会停下来等人审批;被放弃的门留在 `abandoned[]` 里,智能体无法悄悄拍板"差不多得了"。

### ② 编译出的工作流

`compile.mjs` 把图变成智能体编排宿主用的工作流脚本(每个节点一个 `agent()` 调用,扇出用 `parallel()`)。支持从停机点恢复,以及对特定不可逆节点预先审批:

```
Workflow({ scriptPath: "build/graph.workflow.js",
           args: { resume_from, resume_state, resume_loops, approved: ["<节点id>"] } })
```

`policy.requires_approval: true` 的节点,id 不在 `approved` 里就会**在执行前停下**。默认值是空集合 — 有回归测试钉着,审批门无法悄悄失效。

### ③ 运行器 CLI — 手动或智能体直接驾驶

当会话不派子智能体、自己直接过节点时:

```bash
node tools/run.mjs graph.json init            # 创建状态(改过图之后用 init --force)
node tools/run.mjs graph.json next            # 现在能干什么
node tools/run.mjs graph.json status          # 全景,包括还没跑过的门
node tools/run.mjs graph.json start <节点>    # 不在前沿集就拒绝
node tools/run.mjs graph.json measure <字段> <值> [备注]
node tools/run.mjs graph.json done <节点>     # 通过与否由工具决定,不由你
node tools/run.mjs graph.json abort           # 取消进行中的节点
node tools/run.mjs graph.json lint            # OR 陷阱检查(一个节点两个以上的门)
```

每个命令都支持机器可读输出 `--json`。运行器本质上是一份"不许发生的事"清单,来自四条不变式(INV-1 到 INV-4,见 [run.mjs](tools/run.mjs)):

| 你尝试 | 运行器的回答 |
|---|---|
| `start` 一个还没轮到的节点 | 拒绝 — 并列出你现在*可以*启动的节点 |
| 本次访问没有新测量就 `done` | 拒绝 — 旧测量值不结转,过期的绿灯混不过重试 |
| `measure` 一个图里从未声明的字段 | 拒绝 — 测量未声明的字段,不过是走了流程的瞎猜 |
| `init` 之后改图继续跑 | 标记 **STALE** — 状态记得自己是从哪个图哈希生出来的 |
| 门失败次数超过 `max_retry` | **停机** — 运行停止,决定权交还给人 |

每条被接受的测量都追加到台账。台账永不改写,`init --force` 也只丢弃状态、保留台账。

## 教程:真刀真枪跑一遍

下面的一切都真实发生过 — 命令和输出取自一次实况会话,连失误都包括在内。(工具消息目前是韩语,附有译文。)

假设你有个小 Node 项目 `my-api`,想让智能体加一个搜索端点并让测试通过。

**1. 脚手架。** 给它仓库路径和一句话任务:

```bash
node tools/scaffold.mjs ../my-api "加搜索 API 并让测试通过" ../my-api/graph.json
```

你会得到一个已经通过验证的三节点骨架(`survey → check → review`),技术栈和规模已实测,两个哈希已盖章。

**2. 设计。** 把占位符换成真实计划 — 三个节点,一个门:

```jsonc
"state": [{ "field": "tests_failed", "type": "int", "unit": "count" }],
"gates": [{
  "id": "G1", "field": "tests_failed", "op": "==", "threshold": 0,
  "on_fail": { "goto": "implement", "max_retry": 2 },
  "ground_truth": "measured",
  "threshold_source": "整个套件必须全过 — 部分通过不是发布标准"
}],
"edges": [
  { "from": "implement", "to": "test", "when": "always"       },
  { "from": "test", "to": "implement", "when": "gate:G1:fail" },
  { "from": "test", "to": "ship",      "when": "gate:G1:pass" }
]
```

**3. 盖章 → 验证。** 写这个教程时我们真出了个错 — 改了节点名却忘了 `graph.entry`。验证器在任何东西运行之前就抓住了它:

```
$ node tools/validate.mjs graph.json
  FAIL  可达性
         ↳ graph.entry 'survey': 没有这个节点
  static_checks_passed  5/6      G4c FAIL
```

改好 entry,重新盖章(`hash.mjs --write`),重新验证 → `6/6`,覆盖率 `1.00`。

**4. 编译。**

```
$ node tools/compile.mjs graph.json build/graph.workflow.js
  gate_loss  0      PASS
  hook_loss  0      PASS
  compiled → build/graph.workflow.js
  hooks    → build/hooks.json
```

**5. 执行。** 运行器会话实录(仅添加注释):

```
$ run.mjs graph.json init
$ run.mjs graph.json start ship          # 想跳步的话
🔴 不在前沿集的节点: ship — 你现在能启动的是: implement

$ run.mjs graph.json start implement     # ok — 真正的活在这里干
$ run.mjs graph.json done implement      # 打开下一个: test

$ run.mjs graph.json start test
$ run.mjs graph.json done test           # 忘了测量的话
🔴 无法裁决这个门 — 本次访问没有测量:
   G1: tests_failed 一次都没测过

$ run.mjs graph.json measure tests_failed 3 "npm test: 3 failing"
$ run.mjs graph.json done test
🔴 G1: tests_failed=3 == 0 → fail        # 退回 implement(重试 1/2)

# ...修好代码,再走一遍 implement → test...
$ run.mjs graph.json measure tests_failed 0 "npm test: all green"
$ run.mjs graph.json done test
🟢 G1: tests_failed=0 == 0 → pass

$ run.mjs graph.json status
  ▶ ship  (human/manual)  ⏸ 等待人类      # 不可逆 → 出口由人来接
```

注意没有发生的事:从头到尾没人问过智能体"做完了吗?"。它报 3,工具说 fail;它报 0,工具说 pass — 仅此而已。

**6. 从会话外部也强制执行(可选)。** 编译已经输出了 `build/hooks.json`。安装后,门会接进会话的 Stop 钩子 — 但安装器在没有明确审批之前拒绝动手:

```
$ node tools/install-hooks.mjs graph.json build/hooks.json
安装计划(还什么都没写):
  目标    .claude/settings.json
  钩子    Stop → node tools/hooks-gate.mjs graph.json build/hooks.json
  门      G1
需要审批 — 用户确认后:同一条命令加 --yes    (exit 3)
```

加 `--yes` 安装之后,只要有门是红的,会话就真的无法结束回合(`hooks-gate.mjs` 以 exit 2 拦截)。安装后图变了,门会报 STALE 并拦截,而不是按旧规则放行 — 重新编译 → 重新安装才是解法。随时可用 `--uninstall --yes` 卸载。

## 图的格式

正本是一个 JSON 文件。组成部分:

**节点** — 要做的事。`kind` 是 `work`、`human` 或 `join`(v1.1 里的 `gate` 节点类型已废弃 — 门现在归边管)。每个节点带 `budget` 和 `retry.max`;不可逆的步骤挂上 `policy.requires_approval: true` — 编译器会把它变成真正的停机点。

**边** — 顺序。`when` 要么是 `always`,要么是 `gate:<id>:pass` / `gate:<id>:fail`。词汇表就这么多,没有"有时候"。

**门** — 通过条件。一个 JSON 对象,没有自由文本字段,不存在宽松解读的空间:

```jsonc
{
  "id": "G1",
  "field": "tests_failed",          // 必须在 state[] 中声明 — 未知字段直接拒绝
  "op": "==",                        // ==  >=  <=  >  <  之一
  "threshold": 0,
  "on_fail": { "goto": "fix", "max_retry": 2 },
  "ground_truth": "measured",        // measured | reported | human | assumed
  "threshold_source": "为什么是这个数 — 逼你把依据白纸黑字写一次"
}
```

`max_retry: 0` 的意思是*分支*而不是*停机* — "失败就不重试,走那条路"(降级发布路径、NO-GO 报告)。但如果零重试的分支指回一个已经完成的节点,那就是没有预算的循环,运行器会停下来。

执行 `done` 时,工具读取 `tests_failed` 的最新测量值,应用 `== 0`,给出答案。对阈值有异议,请在运行前提;运行中没有任何渠道对裁决讨价还价。

**状态 (state)** — 可测量字段的白名单,每个字段有类型:`int`、`ratio`、`bool`、`enum`、`ref`、`text`。能设门的只有 `int`/`ratio`/`bool` — 散文上设不了阈值,所以 `enum`/`ref`/`text` 得先派生成计数器。单位错误模式也会抓:给 `ratio`(0~1)字段设百分比阈值 90,就是一个永远过不了的门 — 真实发生过的 bug。

**指纹 (fingerprint)** — 目标仓库的实测事实(技术栈、规模、12 种固定标记)。由 `scaffold` 填写,禁止猜测。规模用区间记(`100-299` 个文件)— 精确数字明天就错了,区间能对很久。

**宿主 (host)** — 强制执行住的地方:`state_file`(运行器状态的存放处)、`enforced_by_hook`(要机器强制的门,每条形如 `{ "gate": "G0", "check": "node tools/validate.mjs graph.json" }` — 没有命令的声明正是 `hook_loss` 要数的东西)、`produces`。

**规格哈希** — `hash.mjs` 对图的规范形(键序无关、数组序保留 — 顺序有含义)盖 sha256 章。所有下游产物都携带这个哈希,运行器靠它发现运行中被改的图(STALE),钩子靠它对上自己强制的到底是哪张图。

**模式版本管理** — `spec.version` 选择验证词汇表。旧的 v1.1 图按 v1.1 规则验证(它们是回归测量的正本,拒绝它们就抹掉了基准线),但 v1.1 被标记为*不可执行* — 它没有"哪个仓库、什么任务"的字段,所以编译器拒绝。通过验证和可以安全执行是两个不同的主张,工具不把它们混在一起。

## 四个数字

**运行之前,四个数字必须全绿:**

| | 通过条件 | 含义 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 13 个必填字段全部填写 |
| `static_checks_passed` | 6/6 | 图的结构没有问题 |
| `gate_loss` | 0 | 声明的每个门都进入了编译后的代码 |
| `hook_loss` | 0 | 声明的每个钩子背后都有真实命令 |

如果某个 loss 不为零,说明存在"只有声明、无人强制"的东西。那样的图是装饰品,工具会用非零退出码直说。

## 逐个工具讲

6 个独立文件,彼此之间只有 import,谁都不调用 LLM(INV-1)。确定性是字面意思:同样的输入,同样的字节。

### `scaffold.mjs` — 实测,不猜

遍历目标仓库(跳过 `node_modules`、`.git`、构建产物;有上限,绝不爬 5 万个文件),检测技术栈,规模分桶,盖哈希章,输出一个**已经通过验证的**图骨架。节点是占位符 — 那部分是判断,归你。但昂贵的样板(13 个必填字段、哈希、retry/policy 默认值、至少 1 个必需的 human 节点)由机器填。从绿色开始、保持绿色,好过从红色开始、不知道何时变绿。

### `hash.mjs` — 规范 JSON + sha256

规范化(键序无关、数组序保留)、哈希、把 `sha256:<64hex>` 盖进图里(哈希字段自身除外)。幂等 — 跑三次结果相同。STALE 检测和钩子对账全挂在这个章上。

### `validate.mjs` — G0 + 六项检查 + 有立场的模式

- **G0**:13 个必填字段全量。部分满足没有意义,所以标准是 1.00。
- **六项静态检查**:门只引用已声明的状态字段 · 不可逆节点有审批 · 每个节点可达 · 每个循环有上限(可终止性) · 每个节点有预算 · 每条边指向真实节点且 `when` 格式正确。
- **模式层面的拒绝**(检查还没跑就拒):描述性门 — 用散文代替 `字段/运算符/阈值` 的门根本无法表达 · 未知运算符 · 给不可设门的类型设门 · 布尔阈值 · `host.enforced_by_hook` 里的幽灵门引用 · 新图使用已废弃词汇。
- **质量警告**(非致命):缺 `scope`/`host`、声明了钩子却没有 check 命令。

### `render.mjs` — markdown 是产物

把 JSON 确定性地渲染成可读的 markdown。`--check` 会重新渲染并与已提交的 `graph.md` 做**逐字节**(sha256)比对 — 这就是 G0b 门。谁手改了 markdown,检查就爆。文档不可能偏离计划,因为文档就是计划的渲染。

### `compile.mjs` — 无损翻译,否则不翻译

从 IR 到工作流脚本的纯函数。内部禁止非确定性 — 没有 `Date`,没有 `Math.random`,不依赖对象键遍历顺序。它输出:

- 每个节点一个子智能体调用,每条提示词注入**共享上下文块**(指纹、target、task)— 实测事实跟着工作一起走;
- 有多条 `always` 边的节点**并行扇出**,分支汇合于单一 join;
- 保留 human 节点的门(由人测量的 `design_approved` 也是门,不是注释);
- `requires_approval` 节点的**审批停机**,尊重 `approved` 参数(默认:谁都没被批准);
- **恢复**支持(`resume_from`、`resume_state`、`resume_loops`);
- **ABANDONED 台账**(下一节);
- `build/hooks.json` — 每个钩子强制的门一条:`{ gate, field, op, threshold, check, expect_exit: 0 }`,靠规格哈希与图绑定。

然后它审计自己:IR 里的每个门都必须出现在输出里(`gate_loss`),声明的每个钩子都必须带着命令出现在 `hooks.json` 里(`hook_loss`)。任何地方有 loss → 退出码非零,产物不可信。

### `run.mjs` — 执行者

前沿集纪律、测量台账、门裁决、STALE 检测、停机交人。在[三种运行方式](#三种运行方式)里讲过了;文件开头的四条不变式就是契约,自检的存在就是为了证明每一条真的会咬人。

### `install-hooks.mjs` + `hooks-gate.mjs` — 超越会话的强制执行

安装器把 `build/hooks.json` 作为 Stop 钩子接进**项目的** `.claude/settings.json`。重点在它守住的边界:没有 `--yes` 就什么都不写(只打印计划并 exit 3 — 智能体不得在未经用户许可时自行加 `--yes`);全局 `~/.claude` settings 即使加了 `--yes` 也拒绝;哈希对不上当前图的过期规格拒绝;别人的钩子条目原样保留;重复安装幂等。`--uninstall --yes` 随时卸载。

装好之后,每当会话要结束回合,`hooks-gate.mjs` 就跑一遍所有已声明的 check:全过 → exit 0;有一个不过 → exit 2 拦截结束,并把不合格的门反馈给模型。图变了就报 STALE 并拦截 — 悄悄执行昨天的规则,比停下来更不诚实。

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

## 设计的书面痕迹

[docs/graph/](docs/graph/) 里是完整的设计史 — 1,300 多行,没有一行是营销:

- **[avalon-graph.md](docs/graph/avalon-graph.md)** — v4 规格:每次修订都写明证据的版本史、四个阶段、门的名册(9 个激活,2 个因测量流程尚未定义而明确*搁置* — 没有流程的门不是门,所以停放起来,不假装存在)、从门设计中刻意移除的东西,以及把隐藏前提大声写出来的清单。
- **[ir-schema.md](docs/graph/ir-schema.md)** — 机器可读的 IR 规格:指纹(12 种固定标记,只许实测)、`target`/`task`、模式版本管理、状态白名单、六项静态检查、markdown 为何从 JSON 渲染,以及把 Avalon 自己的图当作完整示例 — 含"自我应用暴露了什么"一节。
- **[phase0-findings-v2.md](docs/graph/phase0-findings-v2.md)** — 杀死了宣传话术的调研:"行业标准五层"这个框架被查明并不存在 · "自动设计"这个差异化卖点对照商业与学术先例后被证伪、废弃 · 而那些没找到反例的主张,*依然*不拿来做对外宣称 — 反例的缺席不是证明。

最后这个习惯就是整个目录的意义所在:文档记录的不只是 Avalon 是什么,还有它差点成为什么、以及那为什么是错的。

## 放弃不等于成功

<img src="images/abandon.svg" alt="重试耗尽的门会把证据留在 abandoned[] 里,只要该列表非空,最终的 completed 就被强制为 false" width="100%" />

当一个门耗尽重试、且配置为 `on_exhaust: partial` 时,工作流会继续前进 — 但会把 `{门, 节点, 字段, 运算符, 阈值, 实测值, 尝试次数}` 记入 `abandoned[]` 列表,而只要这个列表非空,最终的 `completed` 标志就被**强制置为 false**。跳过了门的运行,没有任何办法把自己上报为成功。这一点由真正执行编译产物的语义测试钉死。

## 钩子:规格不等于安装

`compile.mjs` 只输出到 `build/hooks.json` 为止 — 每个门的 check 命令 + 退出码契约 — 停在那里是有意的。安装由另一个工具、在另一次审批之下完成:`install-hooks.mjs` 先展示计划,在人确认的 `--yes` 之前什么都不写,只装进项目 settings(永不碰全局),卸载和安装一样容易。自动安装依然被禁止:一个悄悄把自己接进你会话强制层的工具,恰恰是这个项目要防的那种无法问责的魔法。安装之前,规格不拦截任何东西 — 而且完成报告被要求原样写出这句话。

## Avalon 跑在 Avalon 上

仓库根目录的 [graph.json](graph.json) 不是示例 — 它是 Avalon 用 Avalon 管理自己开发的那张图。7 个节点(`frontend → validate → render_check → backend → compile_check → human_go → install_hooks`),6 个已声明状态字段,3 个门(G0、G0b、G4c)通过 `host.enforced_by_hook` 机器强制 — 每个都带着真正执行检查的命令。[graph.md](graph.md) 是它的渲染,由 G0b 逐字节验证。

图的 `guarantees` 块是"诚实的边界"清单的机器化形态:`provides` 写明一次绿色运行到底证明了什么,`excludes` 写明它不证明什么。如果这个仓库自己的门变红,它的 CI 就会失败。

## 怎么测试的

`npm test` 一条命令跑三个套件,共 136 个:

- **[test.mjs](tools/test.mjs)(88 个)** — 模式和编译器行为,包括**执行语义**:编译出的工作流产物在打桩的宿主上被真正执行,所以"abandoned 非空时 completed 为 false"这类主张是演示出来的,不是断言出来的。部署同步门把 8 个运行时文件与已安装的技能副本逐字节比对,仓库和部署版无法悄悄漂移。
- **[run.selftest.mjs](tools/run.selftest.mjs)(36 个)** — 用唯一能证明护栏存在的方法测试运行器的拒绝墙:*删掉护栏,套件必须变红。* 每个测试构造一种被禁止的局面(跳前沿集的 start、没测量的 done、改图继续跑、篡改台账),只有运行器拒绝了才算通过。
- **[install.selftest.mjs](tools/install.selftest.mjs)(12 个)** — 用同样的方法测安装器的边界:无 `--yes` 不写、拒绝全局、拒绝过期规格、保留他人钩子、幂等重装,以及门在不合格与 STALE 时的拦截(exit 2)。

CI 在 ubuntu 和 windows 上跑全部两个套件。换行符通过 [.gitattributes](.gitattributes) 钉死为 LF — 因为 G0b 是逐字节的判据,CRLF 检出严格来说就是另一份文档。

## 仓库地图

```
SKILL.md                 技能入口 — 流程与纪律
graph.json / graph.md    自我应用的图(JSON 为正本,md 是渲染产物)
tools/
  scaffold.mjs           实测仓库 → 生成绿色骨架
  hash.mjs               canonical JSON + sha256 盖章
  validate.mjs           G0 全量 + 6 项静态检查 + 模式版本管理
  render.mjs             JSON → markdown(--check 为逐字节判据)
  compile.mjs            IR → 工作流脚本 + hooks.json(从不调用 LLM)
  run.mjs                运行器 — 前沿集、测量台账、门裁决
  install-hooks.mjs      带审批门的钩子安装器(仅限项目 settings)
  hooks-gate.mjs         Stop 钩子执行者 — 红灯的门拦截回合结束
  test.mjs               模式 / 编译器 / 执行语义测试(88 个)
  run.selftest.mjs       运行器自检 — "删掉护栏会变红吗"(36 个)
  install.selftest.mjs   安装器/门自检 — 审批·范围·STALE 之墙(12 个)
docs/graph/              设计史、IR 规格、上述伤疤的原始记录
images/                  本 README 的示意图
```

## 诚实的边界

- 工具只能证明**声明了的判据**。check 命令和它的人类语言标题是否同一个意思,仍然要靠人看。
- `build/hooks.json` 只是规格。在通过 `install-hooks.mjs --yes`(人工审批的步骤)安装之前,它不会拦截任何东西。
- 智能体节点在运行时产生的产物,无法在编译期比对。
- 工具消息目前是韩语。退出码和 JSON 输出与语言无关,但文案还不是。

完整的当前清单在自我应用图的 `guarantees` 块里。

## 许可证

[MIT](LICENSE)
