// 阴性测试样本：故意违反 DSH 内核契约的插件。
//
// ⚠️ 这是**测试夹具**，不是给人用的插件。用途：验证 dsh-contract-check 能不能
// 在**加载时**就发现违规的 render 契约。
//
// ── 零外部依赖是刻意的（真实事故换来的）──────────────────────────────
// 上一版这里写了 `import { defineTool } from "@deepseek-ai/dsh-tools"`，而夹具目录
// 没有 node_modules；在 pnpm 的 `link:` 下 Node 按**真实路径**解析 → 找不到包 →
// ERR_MODULE_NOT_FOUND → **整个插件树起不来，DSH 无法启动**（2026-09-19 事故）。
//
// 现在改为直接用裸定义对象调用 `ctx.tools.register()`（内核只要求 output.render 是
// 函数、output.schema 是受支持的 JSON Schema）。因此本文件**不 import 任何东西**，
// 从根上不可能再因解析失败拖垮启动。
//
// ── 为什么安全 ─────────────────────────────────────────────────────
//   1. 违规只体现在 `render` 的**返回值形态**上；工具不被调用就不产出任何内容。
//   2. 即使被调用，本机已打 P0-1 内核守卫（写路径把非数组规范化成 text 块），
//      不会写坏会话历史。
//
// 注册两个工具，覆盖三态中的两种：
//   fixture_bad_render     → render 返回裸字符串 → 判 violation（角标变黄）
//   fixture_unknown_render → 静态判不准，但**实机会被抓成 violation**
//
// 关于第二个（2026-09-20 实机修正了预期）：
//   初版注释写的是"应判 unknown"，实测却是 **violation** —— 而且那是对的：
//   它的 render 返回传进去的值，而它声明的输出 schema 是对象，
//   所以真调用时返回的一定不是数组 = 实打实的违规。
//   静态看不透的，实测跑一次就清楚：这正是实测探针存在的意义。

/** 本地辅助：让 render 的返回形态静态不可判定（初版以为是 unknown 用例，
 *  实测证明它会被探针抓成 violation —— 详见文件头说明） */
function formatResult(value) {
  return value;
}

const EMPTY_OBJECT_SCHEMA = { type: "object", additionalProperties: false, properties: {} };

const BAD_TOOL = {
  name: "fixture_bad_render",
  description: "Test fixture: output.render returns a bare string, violating the ContentBlock[] contract.",
  parameters: EMPTY_OBJECT_SCHEMA,
  output: {
    schema: EMPTY_OBJECT_SCHEMA,
    // ↓↓↓ 违规点：契约要求 ContentBlock[]，这里返回字符串 ↓↓↓
    render: (_args, _value) => "this should be a ContentBlock[] but is a bare string"
  },
  async execute() {
    return {};
  }
};

const UNKNOWN_TOOL = {
  name: "fixture_unknown_render",
  description: "Test fixture: output.render delegates to a helper, so its return shape is not statically decidable.",
  parameters: EMPTY_OBJECT_SCHEMA,
  output: {
    schema: EMPTY_OBJECT_SCHEMA,
    render: (_args, value) => formatResult(value) // 静态判不准 → unknown（不算违规）
  },
  async execute() {
    return {};
  }
};

export const FIXTURE_TOOLS = [BAD_TOOL, UNKNOWN_TOOL];

export default {
  name: "contract-check-fixture",
  apply(ctx) {
    const register = (tctx) => {
      try {
        const tools = tctx?.tools ?? tctx;
        for (const tool of FIXTURE_TOOLS) tools.register(tool);
        ctx.logger?.warn?.("[contract-check-fixture] 已注册 2 个测试工具（1 个故意违规）");
      } catch (error) {
        ctx.logger?.warn?.(`[contract-check-fixture] 注册失败：${String(error?.message ?? error)}`);
      }
    };
    // 与 contract-check 同样的注入处理：tools 就绪后再注册
    if (typeof ctx.inject === "function") ctx.inject(["tools"], register);
    else if (ctx.tools) register(ctx);
  }
};
