import type { MagentoHttpClient } from './http.js';
import { MagentoCategorySchema, type MagentoCategory } from './schemas.js';

export class MagentoCategoriesResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/categories` — returns the category tree. */
  async tree(): Promise<MagentoCategory> {
    const raw = await this.http.getJson<unknown>('/rest/V1/categories');
    return MagentoCategorySchema.parse(raw);
  }

  /**
   * Flatten the category tree into a list, depth-first, preserving the
   * `path` (array of parent names).
   */
  async list(): Promise<{ id: number; name: string; parentId?: number; path: string[] }[]> {
    const root = await this.tree();
    const out: { id: number; name: string; parentId?: number; path: string[] }[] = [];
    const walk = (node: MagentoCategory, ancestors: string[], parentId?: number): void => {
      const here = [...ancestors, node.name];
      const entry: { id: number; name: string; parentId?: number; path: string[] } = {
        id: node.id,
        name: node.name,
        path: here,
      };
      if (parentId !== undefined) entry.parentId = parentId;
      out.push(entry);
      for (const child of node.children_data ?? []) walk(child, here, node.id);
    };
    walk(root, []);
    return out;
  }
}
