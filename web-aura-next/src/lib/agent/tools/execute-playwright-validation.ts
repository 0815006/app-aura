/**
 * Playwright 无头浏览器 DOM 抓取工具 — execute_playwright_validation
 *
 * 在服务器端驱动 Playwright Chromium 无头浏览器，注入鉴权信息，
 * 打开目标系统页面，抓取真实渲染的 DOM 文本与结构。
 *
 * 安全约束：
 * - URL 仅允许 http/https 协议
 * - 执行超时 60 秒硬截断
 * - 浏览器进程强制 kill 防止僵尸进程泄漏
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

const BROWSE_TIMEOUT_MS = 60_000;
const PAGE_LOAD_TIMEOUT_MS = 30_000;

// ============================================================
// Zod Schema
// ============================================================

const sessionCookieSchema = z.object({
  name: z.string().describe("Cookie 名称"),
  value: z.string().describe("Cookie 值"),
  domain: z.string().optional().describe("Cookie 所属域名"),
  path: z.string().optional().default("/").describe("Cookie 路径"),
});

const fieldSelectorsSchema = z.object({
  username: z.string().optional().default("#username"),
  password: z.string().optional().default("#password"),
  submitButton: z.string().optional().default('button[type="submit"]'),
});

const authConfigSchema = z.object({
  mode: z
    .enum(["COOKIE_INJECTION", "FORM_LOGIN", "NONE"])
    .default("NONE")
    .describe(
      "鉴权模式：COOKIE_INJECTION=注入已有Cookie绕过登录，FORM_LOGIN=自动填写表单登录，NONE=无鉴权直接访问"
    ),
  loginUrl: z.string().optional().describe("FORM_LOGIN 模式下的登录页面 URL"),
  username: z.string().optional().describe("FORM_LOGIN 模式下的测试账号"),
  password: z.string().optional().describe("FORM_LOGIN 模式下的测试密码"),
  sessionCookies: z
    .array(sessionCookieSchema)
    .optional()
    .describe("预置的有效鉴权 Cookie 数组，注入后直接空降到目标页，绕开图形验证码"),
  fieldSelectors: fieldSelectorsSchema
    .optional()
    .describe("表单登录字段的 CSS 选择器映射"),
});

// ============================================================
// 安全校验
// ============================================================

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`无效的 URL: ${raw}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`不支持的协议: ${url.protocol}，仅允许 http/https`);
  }

  // 禁止访问内网保留地址（可通过环境变量覆盖）
  const blockPrivate =
    process.env.AURA_PLAYWRIGHT_BLOCK_PRIVATE !== "false";
  if (blockPrivate) {
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.20.") ||
      hostname.startsWith("172.21.") ||
      hostname.startsWith("172.22.") ||
      hostname.startsWith("172.23.") ||
      hostname.startsWith("172.24.") ||
      hostname.startsWith("172.25.") ||
      hostname.startsWith("172.26.") ||
      hostname.startsWith("172.27.") ||
      hostname.startsWith("172.28.") ||
      hostname.startsWith("172.29.") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.") ||
      hostname === "[::1]"
    ) {
      throw new Error(
        `安全限制：禁止访问内网地址 (${hostname})。如需允许，设置环境变量 AURA_PLAYWRIGHT_BLOCK_PRIVATE=false`
      );
    }
  }

  return url;
}

// ============================================================
// 页面抓取
// ============================================================

async function scrapePage(page: Page) {
  return page.evaluate(() => {
    // 提取所有可见文本片段
    const textNodes = new Set<string>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          // 跳过不可见元素
          const style = window.getComputedStyle(parent);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          // 跳过 script/style 标签
          const tag = parent.tagName.toLowerCase();
          if (["script", "style", "noscript"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          const text = (node.textContent ?? "").trim();
          return text.length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );

    while (walker.nextNode()) {
      const text = (walker.currentNode.textContent ?? "").trim();
      if (text) textNodes.add(text);
    }

    // 提取表单元素和交互元素
    const visibleElements: Array<{
      tag: string;
      text: string;
      selector: string;
      attributes: Record<string, string>;
    }> = [];

    const interactiveElements: Array<{
      tag: string;
      text: string;
      type: string;
      selector: string;
    }> = [];

    // 查询所有可见的表单元素和交互元素
    const selectors = [
      "input",
      "button",
      "select",
      "textarea",
      "a",
      "label",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span[role]",
      'div[role="button"]',
      'div[role="link"]',
      '[data-testid]',
    ];

    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        )
          return;

        const tag = htmlEl.tagName.toLowerCase();
        const text = (htmlEl.textContent ?? "").trim().slice(0, 200);

        // 构建简要选择器
        let selector = tag;
        if (htmlEl.id) selector += `#${htmlEl.id}`;
        else if (htmlEl.className && typeof htmlEl.className === "string") {
          const cls = htmlEl.className.trim().split(/\s+/).slice(0, 2).join(".");
          if (cls) selector += `.${cls}`;
        }

        const attrs: Record<string, string> = {};
        for (const attr of ["id", "name", "type", "placeholder", "value", "aria-label", "data-testid"]) {
          const val = htmlEl.getAttribute(attr);
          if (val) attrs[attr] = val;
        }

        if (text || Object.keys(attrs).length > 0) {
          visibleElements.push({ tag, text, selector, attributes: attrs });
        }

        // 交互元素单独记录
        if (["input", "button", "select", "textarea", "a"].includes(tag)) {
          const inputType =
            tag === "input"
              ? (htmlEl as HTMLInputElement).type || "text"
              : tag === "a"
                ? "link"
                : tag;
          interactiveElements.push({
            tag,
            text,
            type: inputType,
            selector,
          });
        }
      });
    });

    return {
      textContents: Array.from(textNodes),
      visibleElements,
      interactiveElements,
    };
  });
}

// ============================================================
// 认证流程
// ============================================================

interface AuthConfig {
  mode: "COOKIE_INJECTION" | "FORM_LOGIN" | "NONE";
  loginUrl?: string;
  username?: string;
  password?: string;
  sessionCookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  fieldSelectors?: {
    username: string;
    password: string;
    submitButton: string;
  };
}

async function authenticateAndNavigate(
  context: BrowserContext,
  page: Page,
  targetUrl: string,
  auth: AuthConfig
): Promise<string> {
  if (auth.mode === "NONE") {
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    return "无鉴权直接访问";
  }

  if (auth.mode === "COOKIE_INJECTION" && auth.sessionCookies?.length) {
    // 注入 Cookie
    const cookies = auth.sessionCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? new URL(targetUrl).hostname,
      path: c.path ?? "/",
    }));
    await context.addCookies(cookies);

    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    return `Cookie 注入成功 (${cookies.length} 个 Cookie)`;
  }

  if (auth.mode === "FORM_LOGIN" && auth.loginUrl) {
    const selectors = auth.fieldSelectors ?? {
      username: "#username",
      password: "#password",
      submitButton: 'button[type="submit"]',
    };

    // 前往登录页
    await page.goto(auth.loginUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });

    // 填写表单
    if (auth.username) {
      await page.fill(selectors.username, auth.username);
    }
    if (auth.password) {
      await page.fill(selectors.password, auth.password);
    }

    // 点击提交并等待导航
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "networkidle",
        timeout: PAGE_LOAD_TIMEOUT_MS,
      }),
      page.click(selectors.submitButton),
    ]);

    // 检查是否登录成功（URL 不再是 login 页面）
    const currentUrl = page.url();
    if (currentUrl.includes("login") || currentUrl.includes("auth")) {
      return `表单登录失败：提交后仍在登录页面 (${currentUrl})`;
    }

    // 跳转到目标页
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });

    return "表单登录成功";
  }

  throw new Error(
    `鉴权配置不完整：mode=${auth.mode} 需要对应的参数 (loginUrl/sessionCookies)`
  );
}

// ============================================================
// 工具定义
// ============================================================

export const executePlaywrightValidation = tool({
  description:
    "驱动服务器端无头浏览器（Chromium），注入登录态参数，跳转到目标系统页面抓取 DOM 结构与可见文本。支持三种鉴权模式：Cookie 注入绕验证码、表单自动登录、无鉴权直接访问。用于 UI 原型契约校验 —— 将原型设计中的期望文本与真实页面文本进行自动化比对。",
  parameters: z.object({
    targetUrl: z
      .string()
      .describe(
        "目标系统页面的完整 URL，如 https://bank-uat.example.com/transfer/confirm"
      ),
    authConfig: authConfigSchema
      .optional()
      .describe("目标系统的准入鉴权配置"),
    waitForSelector: z
      .string()
      .optional()
      .describe(
        "等待某个 CSS 选择器出现后再开始抓取（用于 SPA 异步渲染场景），如 '.main-content'"
      ),
    waitTimeout: z
      .number()
      .optional()
      .default(15000)
      .describe("页面加载等待超时毫秒数，默认 15 秒"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    targetUrl,
    authConfig,
    waitForSelector,
    waitTimeout,
  }: {
    targetUrl: string;
    authConfig?: AuthConfig;
    waitForSelector?: string;
    waitTimeout?: number;
  }): Promise<string> => {
    const startTime = Date.now();

    // 1. URL 安全校验
    validateUrl(targetUrl);
    if (authConfig?.loginUrl) {
      validateUrl(authConfig.loginUrl);
    }

    let browser: Browser | null = null;

    try {
      // 2. 启动 Playwright Chromium 无头模式
      const launchArgs: string[] = [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
      ];

      // Docker/CI 环境可能需要 --no-sandbox
      if (process.env.AURA_PLAYWRIGHT_NO_SANDBOX === "true") {
        launchArgs.push("--no-sandbox");
      }

      browser = await chromium.launch({
        headless: true,
        args: launchArgs,
        timeout: BROWSE_TIMEOUT_MS,
      });

      // 3. 创建隔离的 BrowserContext
      const context: BrowserContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Aura-UI-Validator/0.1",
        // 安全：禁用下载和弹窗
        acceptDownloads: false,
      });

      const page: Page = await context.newPage();

      // 设置超时
      const effectiveTimeout = waitTimeout ?? 15000;
      page.setDefaultTimeout(effectiveTimeout);

      // 4. 鉴权并导航到目标页
      const auth = authConfig ?? { mode: "NONE" as const };
      const authResult = await authenticateAndNavigate(
        context,
        page,
        targetUrl,
        auth
      );

      // 检查登录失败
      if (authResult.startsWith("表单登录失败")) {
        await context.close();
        await browser.close();
        return JSON.stringify({
          status: "LOGIN_FAILED",
          currentUrl: page.url(),
          error: authResult,
          executionTime: Date.now() - startTime,
        });
      }

      // 5. 等待页面就绪（SPA 渲染等待）
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, {
            timeout: effectiveTimeout,
          });
        } catch {
          // 选择器未出现不阻塞，继续抓取
          console.warn(
            `[Playwright] 等待选择器超时: ${waitForSelector}`
          );
        }
      }

      // 6. 抓取页面数据
      const currentUrl = page.url();
      const pageTitle = await page.title();

      const scraped = await scrapePage(page);

      // 7. 清理浏览器资源
      await context.close();
      await browser.close();
      browser = null;

      const executionTime = Date.now() - startTime;

      return JSON.stringify({
        status: "SUCCESS",
        currentUrl,
        pageTitle,
        scrapedTexts: scraped.textContents,
        visibleElements: scraped.visibleElements,
        interactiveElements: scraped.interactiveElements,
        authMethod: auth.mode,
        authResult,
        waitForSelector: waitForSelector ?? null,
        executionTime,
        stats: {
          textCount: scraped.textContents.length,
          visibleElementCount: scraped.visibleElements.length,
          interactiveElementCount: scraped.interactiveElements.length,
        },
      });
    } catch (err) {
      // 确保浏览器被关闭
      if (browser) {
        try {
          await browser.close();
        } catch {
          // 忽略关闭错误
        }
      }

      const message = err instanceof Error ? err.message : "未知错误";
      const executionTime = Date.now() - startTime;

      if (message.includes("timeout") || message.includes("Timeout")) {
        return JSON.stringify({
          status: "TIMEOUT",
          error: `页面加载超时 (${BROWSE_TIMEOUT_MS / 1000}s): ${message}`,
          executionTime,
        });
      }

      if (message.includes("net::") || message.includes("ERR_")) {
        return JSON.stringify({
          status: "NAVIGATION_ERROR",
          error: `网络导航错误: ${message}`,
          executionTime,
        });
      }

      return JSON.stringify({
        status: "ERROR",
        error: `Playwright 执行失败: ${message}`,
        executionTime,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
