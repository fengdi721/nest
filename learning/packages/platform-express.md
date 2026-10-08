# @nestjs/platform-express 贡献教程

> 配套测试：`learning/specs/packages/platform-express.spec.ts`（10 个）
> 练习：`PRACTICES.md` 第八阶段 · platform-express

## 1. 一句话定位

Nest 默认的 HTTP 平台：`ExpressAdapter` 实现了 core 定义的 `HttpServer` 接口，
再加上 multer 文件上传的封装（`FileInterceptor` 等）。**你写的每一个 CRUD 接口，底下跑的都是它。**

| 规模 | 数据 |
| --- | --- |
| 源码 | 25 个文件：适配器 1 个（约 600 行），其余是 multer |
| 单元测试 | 10 个 spec |
| 2026 年以来的提交 | 10 个以上，其中 **4 个是 multer 错误映射** |

## 2. 适配器模式：core 和 express 之间的“合同”

core 不 import express。它只调用 `HttpServer` 接口（`packages/common/interfaces/http/http-server.interface.ts`）：

| core 需要的能力 | `ExpressAdapter` 的实现 |
| --- | --- |
| 返回响应 | `reply(res, body, status)`：字符串 → `res.send`，对象 → `res.json`，`StreamableFile` → 管道传输 |
| 设置状态码 / 头 | `status()`、`setHeader()`、`appendHeader()` |
| 注册路由 | `get()`、`post()`…（直接转给 express app） |
| 404 / 错误处理 | `setNotFoundHandler()`、`setErrorHandler()` |
| 解析请求体 | `registerParserMiddleware(prefix, rawBody)`：json + urlencoded，可选保留 rawBody |
| 中间件 | `createMiddlewareFactory()` |
| 版本控制 | `applyVersionFilter()` |
| 平台类型 | `getType()` 返回 `'express'` |

`platform-fastify` 实现的是**同一份接口**。所以修改适配器行为时，
**一定要问：fastify 那边是不是也要改？** 看看最近的提交标题，很多都是 `fix(express,fastify): ...`。

## 3. multer：把一个 express 中间件变成 Nest 拦截器

```
@UseInterceptors(FileInterceptor('file', options))
  → multer/interceptors/file.interceptor.ts：mixin 生成一个拦截器类
      intercept():
        upload.single('file')(req, res, err => ...)    ← 调用原生 multer 中间件
        出错 → transformException(err)                 ← multer/multer/multer.utils.ts
        成功 → next.handle()
  → @UploadedFile() 从 req.file 取值
```

### 错误映射（`multer.utils.ts` 的 `transformException`）

| multer 错误码 | HTTP |
| --- | --- |
| `LIMIT_FILE_SIZE` | 413 Payload Too Large |
| `LIMIT_FILE_COUNT`、`LIMIT_UNEXPECTED_FILE` 等 10 个 | 400，有 `field` 时附加 ` - 字段名` |
| busboy 的格式错误（缺少 boundary 等） | 400 |
| 其他 | 原样抛出 → 500 |

## 4. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| 适配器类型 | `getHttpAdapter()` 是 `ExpressAdapter`，`getInstance()` 是原生 express app |
| `reply()` | 字符串 → `text/html`，对象 → `application/json` |
| 原生设置 | `app.set('x-powered-by', false)` 生效 |
| 404 | `{ message: 'Cannot GET /nope', error: 'Not Found', statusCode: 404 }` |
| `rawBody: true` | 同时拿到原始请求体和解析后的 body（webhook 签名校验常用） |
| 上传 | 内存存储，内容在 `file.buffer` |
| 没有文件 | `file` 是 `undefined`，不报错（要强制必须上传，得用 `ParseFilePipe`） |
| 超过大小 | 413 |
| 字段名不对 | 400，`Unexpected file field - wrong` |
| 超过 `maxCount` | 400 |

### 写测试时的发现：我自己踩中了一个已修复的 bug 的成因

我按旧印象写了 `toBe('Unexpected field - wrong')`，测试失败，实际收到 `'Unexpected file field - wrong'`。
回去看 `multer.utils.ts` 的注释：

> Multer identifies its errors by `code`, while the messages may change between releases
> (e.g. "Unexpected field" became "Unexpected file field")

这正是 `fix(express): map multer errors by code instead of message (#17769)` 修复的问题：
**以前 Nest 按文案匹配，multer 一改文案，映射就失效，原本的 400 变成了 500。**

**教训：** 依赖第三方库时，按**稳定的标识**（错误码、类型）判断，不要按**会变的文案**判断。

### 追问：busboy 为什么还在按文案匹配？

`busboyExceptions` 仍然是按 message 匹配的。这是遗漏吗？去 `node_modules/busboy` 里查：

```bash
grep -n "new Error" node_modules/busboy/lib/types/multipart.js
# 233:  throw new Error('Multipart: Boundary not found');
# 398:  this.emit('error', new Error('Malformed part header'));
# ...
```

busboy 1.6.0 抛出的都是**不带 code 的普通 Error**，所以只能按文案匹配。**结论：不是 bug。**
（如果哪天 busboy 加了 code，这里就值得改。这种“依赖升级后可以改进的点”可以记下来，以后再看。）

## 5. 上游测试

```bash
npx vitest run packages/platform-express
npx vitest run packages/platform-express/test/multer
npx vitest run --config vitest.config.integration.mts integration/file-upload     # 不需要 Docker
npx vitest run --config vitest.config.integration.mts integration/send-files
```

## 6. 贡献切入点

```
fix(common,core,express): answer method miss on an excluded route (#17923)
fix(express): destroy the `StreamableFile` source on client disconnect (#17973)
fix(express): run wildcard middleware on the bare global prefix path (#17942)
fix(express,fastify): keep +json content types on error replies (#17916)
fix(express): map multer array index and invalid field name codes to 400 (#17857)
fix(express): map multer errors by code instead of message (#17769)
```

方向：

1. **依赖升级的影响**：multer、express 5、body-parser 升级时，错误码、默认行为有没有变化？
   renovate 机器人会自动开升级 PR，**评审这些升级 PR、确认没有破坏行为**是很有价值的贡献。
2. **express 和 fastify 的一致性**：同一个请求，两个平台返回的状态码、头、错误格式一样吗？
   （可以拿本测试改成 fastify 版本来比较。）
3. **边界路径**：全局前缀、排除路由、通配符中间件。最近好几个修复都集中在这里。

## 7. 练习

见 `PRACTICES.md` 第八阶段 · platform-express。
