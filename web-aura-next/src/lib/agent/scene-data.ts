/**
 * 场景相关类型定义
 */

export interface SceneListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  dbRequired: boolean | null;
  requiredInputs: SceneInput[];
  sortOrder: number | null;
  status: string | null;
}

export interface SceneDetail extends SceneListItem {
  systemPrompt: string;
  toolWhitelist: string[] | null;
}

export interface SceneInput {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
}

export interface DbConnectionItem {
  id: string;
  label: string;
  dbType: string;
  host: string;
  port: number;
  dbName: string;
  username: string;
  sslMode: string | null;
  extraArgs: unknown;
  lastTestedAt: string | null;
  testResult: string | null;
  testMessage: string | null;
  status: string;
  createTime: string;
  updateTime: string;
}
