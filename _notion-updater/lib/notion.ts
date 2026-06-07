import fs from "node:fs/promises";
import path from "node:path";
import type {
  PageObjectResponse,
  BlockObjectResponse,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints.ts";
import { Client } from "@notionhq/client";
import dotenv from "dotenv";

import { downloadMedia } from "./download-assets.ts";
import { OUT_DIR } from "../index.ts";

dotenv.config();
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ROOT_PAGE_ID = "9d480691-5268-44ce-8e8e-fa39ac419e9f"; // Root guides const

const ESCAPE_TYPES = ["child_database"];
const ROOT_PATH = "root";

const pagesToRender: { id: string; url: string }[] = [];

let treeNodesProcessed = 0;
let totalAssetsDownloaded = 0;

export async function buildTree(
  pageId: string = ROOT_PAGE_ID,
  currentPath: string = ROOT_PATH,
): Promise<any> {
  treeNodesProcessed++;
  process.stdout.write(`\r\x1b[K Pages: ${treeNodesProcessed} | 📦 Assets downloaded: ${totalAssetsDownloaded} | 🔍 Current page: ${currentPath}`);
  const pageInfo = (await notion.pages.retrieve({
    page_id: pageId,
  })) as PageObjectResponse;
  const blocks = await notion.blocks.children.list({ block_id: pageId });

  // Find child databases
  const childDatabases = blocks.results.filter(
    (b) => "type" in b && b.type === "child_database",
  );
  const childrenNodes = [];

  for (const db of childDatabases) {
    if (!("child_database" in db)) continue;
    let hasMore = true;
    let cursor: string | undefined = undefined;

    while (hasMore) {
      const dbQuery: QueryDatabaseResponse = await notion.databases.query({
        database_id: db.id,
        start_cursor: cursor,
      });

      for (const dbChild of dbQuery.results as PageObjectResponse[]) {
        await sleep(100);
        const props = dbChild.properties;

        // Ignore unpublished
        if (
          props.Published &&
          props.Published.type === "checkbox" &&
          !props.Published.checkbox
        ) {
          continue;
        }

        const pageUrlProp = props.pageUrl;
        const pageUrl =
          pageUrlProp.type === "url" ? pageUrlProp.url || "" : dbChild.id;
        const nodePath =
          currentPath === ROOT_PATH ? pageUrl : `${currentPath}/${pageUrl}`;

        let coverFilename = null;
        if (dbChild.cover) {
          const coverUrl =
            dbChild.cover.type === "external"
              ? dbChild.cover.external.url
              : dbChild.cover.file.url;
          coverFilename = await downloadMedia(coverUrl, `${dbChild.id}_cover`);
          totalAssetsDownloaded++;
        }

        const processedProps = await processProperties(props, dbChild.id);
        const childTree = await buildTree(dbChild.id, nodePath);

        pagesToRender.push({ id: dbChild.id, url: nodePath });

        childrenNodes.push({
          id: dbChild.id,
          cover: coverFilename,
          properties: processedProps,
          children: childTree.children || [],
        });
      }

      hasMore = dbQuery.has_more;
      cursor = dbQuery.next_cursor || undefined;
    }
  }

  // Sory by order
  childrenNodes.sort((a, b) => {
    const orderA = a.properties.order?.number;
    const orderB = b.properties.order?.number;
    return orderA - orderB;
  });

  let rootProps = {};
  let rootCover = null;
  if (currentPath === ROOT_PATH) {
    rootProps = await processProperties(pageInfo.properties, pageInfo.id);
    if (pageInfo.cover) {
      const coverUrl =
        pageInfo.cover.type === "external"
          ? pageInfo.cover.external.url
          : pageInfo.cover.file.url;
      rootCover = await downloadMedia(coverUrl, `${pageInfo.id}_cover`);
    }
    pagesToRender.push({ id: pageId, url: ROOT_PATH });
  }

  return {
    id: pageId,
    cover: rootCover,
    properties: rootProps,
    children: childrenNodes,
  };
}

export async function renderPageContent(pageId: string, urlPath: string) {
  const outPath = path.join(OUT_DIR, `${urlPath}.json`);

  try {
    // 1. Load meta-data
    const pageResponse = (await notion.pages.retrieve({
      page_id: pageId,
    })) as PageObjectResponse;

    // 2. Get Notion page blocks
    const rawBlocks = await fetchAllBlocks(pageId);

    const filteredBlocks = rawBlocks.filter(
      (b) => !ESCAPE_TYPES.includes(b.type),
    );

    // 3. Serialize notion objects
    const serializedBlocks = [];
    for (const block of filteredBlocks) {
      serializedBlocks.push(await serializeBlock(block));
    }

    const finalBlocks = packLists(serializedBlocks);

    const pageData = {
      id: pageId,
      type: "page",
      content: {
        title:
          pageResponse.properties.Name?.type === "title"
            ? pageResponse.properties.Name.title[0]?.plain_text
            : "Без названия",
      },
      children: finalBlocks,
      node_properties: {
        properties: {
          Name: (pageResponse.properties as any).Name,
          order: (pageResponse.properties as any).order,
          pageUrl: (pageResponse.properties as any).pageUrl,
        },
        cover:
          (pageResponse as any).cover?.file?.url ||
          (pageResponse as any).cover?.external?.url ||
          null,
      },
    };

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(pageData, null, 2));
  } catch (error) {
    console.error(`[Error] Save error ${urlPath}:`, error);
  }
}

export async function fetchAllPagesContent() {
  const CONCURRENT_LIMIT = 2;
  const total = pagesToRender.length;
  let current = 0;

  const worker = async () => {
    while (current < total) {
      const index = current++;
      const page = pagesToRender[index];
      
      await renderPageContent(page.id, page.url);
      
      process.stdout.write(`\r\x1b[K[${index + 1}/${total}] ${page.url} | Assets downloaded: ${totalAssetsDownloaded}`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENT_LIMIT }, worker));
  
  console.log("\n✅ Все страницы успешно скачаны!");
}

async function processProperties(
  properties: Record<string, any>,
  pageId: string,
) {
  const newProps: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value.type === "files") {
      const files = [];
      for (let i = 0; i < value.files.length; i++) {
        const fileObj = value.files[i];
        const fileUrl = fileObj.file ? fileObj.file.url : fileObj.external?.url;
        if (!fileUrl) continue;

        const isPdf = fileObj.name?.toLowerCase().endsWith(".pdf");
        const safeKey = key.replace(/[^a-zA-Z0-9]/g, "_");
        const filename = await downloadMedia(
          fileUrl,
          `${pageId}_${safeKey}_${i}`,
          isPdf,
        );
        files.push(filename);
        totalAssetsDownloaded++;
      }
      newProps[key] = files;
    } else {
      newProps[key] = value;
    }
  }
  return newProps;
}

async function fetchAllBlocks(blockId: string): Promise<BlockObjectResponse[]> {
  let blocks: BlockObjectResponse[] = [];
  let hasMore = true;
  let cursor: string | undefined = undefined;

  while (hasMore) {
    await sleep(50);
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });
    blocks.push(...(res.results as BlockObjectResponse[]));
    hasMore = res.has_more;
    cursor = res.next_cursor || undefined;
  }
  return blocks;
}

let headingCounter = 0;
async function serializeBlock(block: BlockObjectResponse): Promise<any> {
  const type = block.type;
  const contentData = (block as any)[type];

  let id: string | number = block.id;
  if (type.startsWith("heading_")) {
    id = ++headingCounter;
  }

  let childrenContent: any[] = [];
  if (block.has_children) {
    const rawChildren = await fetchAllBlocks(block.id);

    // Prevent children duplicate
    const filteredChildren = rawChildren.filter(
      (c) => !ESCAPE_TYPES.includes(c.type),
    );

    for (const childBlock of filteredChildren) {
      await sleep(50);
      childrenContent.push(await serializeBlock(childBlock));
    }
    childrenContent = packLists(childrenContent);
  }

  if (type === "image") {
    const imgUrl =
      contentData.type === "external"
        ? contentData.external.url
        : contentData.file.url;
    const filename = await downloadMedia(imgUrl, block.id);
    contentData.file = { url: `/assets/${filename}` };
    contentData.type = "file";
    totalAssetsDownloaded++;
  }

  return {
    id,
    type,
    content: contentData,
    children: childrenContent,
  };
}

function packLists(items: any[]) {
  const forlderTypes: Record<string, string> = {
    bulleted_list_item: "bulleted_list_folder",
    numbered_list_item: "numbered_list_folder",
  };

  const newItems: any[] = [];
  let currentListType: string | null = null;
  let currentListGroup: any[] = [];

  for (const item of items) {
    if (!forlderTypes[item.type]) {
      if (currentListType) {
        newItems.push({
          type: forlderTypes[currentListType],
          children: currentListGroup,
        });
        currentListType = null;
        currentListGroup = [];
      }
      newItems.push(item);
    } else {
      if (currentListType && item.type !== currentListType) {
        newItems.push({
          type: forlderTypes[currentListType],
          children: currentListGroup,
        });
        currentListType = item.type;
        currentListGroup = [item];
      } else {
        currentListType = item.type;
        currentListGroup.push(item);
      }
    }
  }

  if (currentListType) {
    newItems.push({
      type: forlderTypes[currentListType],
      children: currentListGroup,
    });
  }

  return newItems;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
