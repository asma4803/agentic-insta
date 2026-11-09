import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { applyEdits, sameContent, validatePostEdits } from "@/lib/posts/edits";
import { AgentError, type PostDraft, type PostStatus, type StoredPost } from "@/types/agent";

interface PostFile {
  posts: StoredPost[];
}

const DATA_PATH = path.join(process.cwd(), "data", "posts.json");

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => T): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function readPosts(): StoredPost[] {
  try {
    const parsed = JSON.parse(readFileSync(DATA_PATH, "utf8")) as PostFile;
    if (!parsed || !Array.isArray(parsed.posts)) {
      throw new AgentError("data/posts.json is not a list of posts.", 500);
    }
    return parsed.posts;
  } catch (error) {
    if (error instanceof AgentError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw new AgentError("The saved posts could not be read.", 500);
  }
}

function writePosts(posts: StoredPost[]) {
  const directory = path.dirname(DATA_PATH);
  mkdirSync(directory, { recursive: true });
  const temporary = `${DATA_PATH}.tmp`;
  writeFileSync(temporary, JSON.stringify({ posts }, null, 2));
  renameSync(temporary, DATA_PATH);
}

function cloneDraft(draft: PostDraft): PostDraft {
  return {
    ...draft,
    hashtags: [...draft.hashtags],
    slides: draft.slides.map((slide) => ({ ...slide })),
    issues: [...draft.issues],
    trace: draft.trace.map((step) => ({ ...step })),
  };
}

function requirePost(posts: StoredPost[], id: string): StoredPost {
  const post = posts.find((item) => item.id === id);
  if (!post) {
    throw new AgentError("That draft is no longer saved.", 404);
  }
  return post;
}

function clearPublication(post: StoredPost) {
  delete post.approvedAt;
  delete post.approvedSnapshot;
  delete post.publishedAt;
  delete post.instagramMediaId;
  delete post.permalink;
  delete post.error;
}

export function createPost(draft: PostDraft): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const now = new Date().toISOString();
    const post: StoredPost = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      draft: cloneDraft(draft),
    };
    posts.push(post);
    writePosts(posts);
    return post;
  });
}

export function getPost(id: string): Promise<StoredPost | null> {
  return withLock(() => readPosts().find((post) => post.id === id) ?? null);
}

export function updatePost(id: string, raw: unknown): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const post = requirePost(posts, id);
    if (post.status === "publishing" || post.status === "published") {
      throw new AgentError("This post can no longer be edited.", 409);
    }

    const next = applyEdits(post.draft, validatePostEdits(post.draft, raw));
    if (sameContent(post.draft, next)) {
      return post;
    }

    post.draft = next;
    post.status = "draft";
    clearPublication(post);
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    return post;
  });
}

export function approvePost(id: string): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const post = requirePost(posts, id);
    if (post.status === "publishing" || post.status === "published") {
      throw new AgentError("This post can no longer be approved.", 409);
    }

    const now = new Date().toISOString();
    post.status = "approved";
    post.approvedAt = now;
    post.approvedSnapshot = cloneDraft(post.draft);
    delete post.error;
    post.updatedAt = now;
    writePosts(posts);
    return post;
  });
}

export function markPublishing(id: string): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const post = requirePost(posts, id);
    if (post.status !== "approved" || !post.approvedSnapshot) {
      throw new AgentError("Approve the draft before publishing it.", 409);
    }
    post.status = "publishing";
    delete post.error;
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    return post;
  });
}

export function markPublished(
  id: string,
  result: { instagramMediaId: string; permalink?: string },
): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const post = requirePost(posts, id);
    const now = new Date().toISOString();
    post.status = "published";
    post.instagramMediaId = result.instagramMediaId;
    if (result.permalink) post.permalink = result.permalink;
    else delete post.permalink;
    delete post.error;
    post.publishedAt = now;
    post.updatedAt = now;
    writePosts(posts);
    return post;
  });
}

export function markFailed(id: string, message: string): Promise<StoredPost> {
  return withLock(() => {
    const posts = readPosts();
    const post = requirePost(posts, id);
    if (post.status === "published") return post;
    post.status = "failed" satisfies PostStatus;
    post.error = message;
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    return post;
  });
}
