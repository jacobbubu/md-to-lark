# fetch-board-data 命令参考

## 这份参考覆盖什么范围

这份参考只覆盖 `npm run fetch:board-data` 的行为：它是一个调试/排障脚本，不是发布主链路的一部分。

它回答三个问题：

1. 脚本在飞书文档里找的是哪类块，返回什么内容。
2. 参数、默认行为和边界条件。
3. 这个 JSON 结果通常拿来做什么。

## 一句话结论

`npm run fetch:board-data` 做的是：给定一个文档，按文档顺序找到第 N 个白板块（`block_type=43`），解析出对应 `whiteboard_id`，再抓取白板主题和节点数据，并把这三类结果按约定 JSON schema 打印到标准输出。

## 用法

```bash
npm run fetch:board-data -- --doc <document_id> [--index <n>]
```

推荐写法：

```bash
npm run fetch:board-data -- --doc doxcabc123 --index 2
```

## 参数

### `--doc`, `-d`（必填）

飞书文档 ID，支持：

1. `doc_xxx...`
2. `xxx...`（不带 `doc_` 前缀）

脚本会统一调用 `normalizeDocumentId`，因此两种形式都可。

### `--index`, `-n`（可选）

按文档顺序选择第几个白板块（1-based），默认 `1`。

取值约束：

1. 必须是正整数。
2. 不能小于等于 0。
3. 超出范围会抛错。

### `--help`, `-h`

打印帮助后退出。

## 输出内容

执行成功后，脚本会输出一段带缩进的 JSON（`process.stdout`）：

- `schema`: 固定值 `DOCX_BOARD_DATA`。
- `version`: 固定值 `1.0.0`。
- `documentId`: 标准化后的文档 ID（`doc_` 前缀已剥离）。
- `requestedBoardIndex`: 请求的 board index。
- `totalBoardBlocks`: 文档中 `block_type=43` 的总数。
- `selectedBoardBlockId`: 目标白板块的 `block_id`。
- `whiteboardId`: 从块里解析出的白板标识（按 `board.token -> board.whiteboard_id -> board.board_token -> board.id`）。
- `boardBlock`: 被选择后的 board 原始块对象（若清单里缺少 token 信息会通过 `documentBlock.get` 纠偏后返回）。
- `whiteboardTheme`: `board.v1.whiteboard.theme` 的 `data` 字段（含 `schema` 则保留，缺失则 `{}`）。
- `whiteboardNodes`: `board.v1.whiteboardNode.list` 的 `data` 字段（含页签、节点列表等原始结构）。

## 适用场景

1. Mermaid 发布成白板后快速核验：
   1. 真实文档里是否已经创建了白板块。
   2. `whiteboard_id/token` 是否可解析。
   3. 白板主题和节点是否与预期一致。
2. 调试 `board` 模式下的发布结果，而不直接改动文档内容。
3. 排查 `block_type` 是否对不上（尤其是从 `publish:md` 输出里拿到 block id 后）。

与 `publish:md` 的关系是：这是只读的旁路调试入口，不会做 publish/上传/写入。

## 限制与边界

1. 依赖飞书 API 访问权限，且至少需要 `LARK_APP_ID` 与 `LARK_APP_SECRET`。
2. `LARK_TOKEN_TYPE=user` 时还必须提供 `LARK_USER_ACCESS_TOKEN`。
3. `LARK_TOKEN_TYPE` 只支持 `tenant|user`，无效值直接报错。
4. `LARK_BASE_URL` 若不传默认 `https://open.feishu.cn`。
5. 只抓取 `block_type=43`；不是所有板块都有白板语义。
6. `--index` 超出范围时会直接失败，不会回退到最后一个。
7. whiteboard 相关返回是原始 API 数据，脚本只做最小包装，不做字段重定义。

## 相关环境变量与来源

配置方式来自 `src/lark/client.ts`，对应 `createLarkClientConfigFromEnv`：

1. `LARK_APP_ID`
2. `LARK_APP_SECRET`
3. `LARK_TOKEN_TYPE`
4. `LARK_USER_ACCESS_TOKEN`（`user` 模式）
5. `LARK_BASE_URL`（可选）

脚本会在文件开头加载 `.env`（`dotenv/config`）。

## 下一步阅读

1. `docs/02-guides/mermaid-and-board.md`
2. `docs/04-internals/testing-and-debugging.md`
3. `docs/04-internals/publish-rendering-flow.md`
