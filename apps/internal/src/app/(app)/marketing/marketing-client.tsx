"use client";

import { useState } from "react";
import {
  Plus,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { FaLinkedin, FaXTwitter } from "react-icons/fa6";
import {
  type MarketingPlatform,
  type MarketingPost,
  type PostStatus,
  platformConfig,
  statusStyles,
  generateId,
} from "@/lib/mock-marketing";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  createMarketingPost,
  updateMarketingPost,
  deleteMarketingPost,
} from "@/app/actions";
import { toast } from "sonner";

function NextdoorIcon({ size = 16 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/nextdoor-logo.svg" alt="Nextdoor" width={size} height={size} />;
}

const platformIcons: Record<MarketingPlatform, React.ElementType> = {
  linkedin: (props: Record<string, unknown>) => <FaLinkedin {...props} color="#0077B5" />,
  nextdoor: NextdoorIcon,
  x: (props: Record<string, unknown>) => <FaXTwitter {...props} color="#000" />,
};

export interface MarketingPageProps {
  initialPosts: MarketingPost[];
}

export default function MarketingPage({
  initialPosts: initialPostsProp,
}: MarketingPageProps) {
  const [posts, setPosts] = useState<MarketingPost[]>(initialPostsProp);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<MarketingPost | null>(null);

  const handleSavePost = async (post: MarketingPost) => {
    try {
      if (editingPost && editingPost.id) {
        await updateMarketingPost(post.id, {
          title: post.title,
          content: post.content || undefined,
          platform: post.platform,
          status: post.status,
          scheduledAt: post.status === "scheduled" ? post.date : undefined,
        });
        setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
        toast.success("Post updated");
      } else {
        const created = await createMarketingPost({
          title: post.title,
          content: post.content || undefined,
          platform: post.platform,
          status: post.status,
          scheduledAt: post.status === "scheduled" ? post.date : undefined,
        });
        setPosts((prev) => [{ ...post, id: created.id }, ...prev]);
        toast.success("Post created");
      }
    } catch (err) {
      console.error(err);
      toast.error(
        editingPost ? "Failed to update post" : "Failed to create post",
      );
      return;
    }
    setShowPostModal(false);
    setEditingPost(null);
  };

  const handleDeletePost = async (id: string) => {
    try {
      await deleteMarketingPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Post deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete post");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Marketing</h1>
      </div>

      {/* Platform columns */}
      <div className="grid flex-1 grid-cols-3 gap-4">
        {(["linkedin", "nextdoor", "x"] as const).map((platform) => {
          const config = platformConfig[platform];
          const Icon = platformIcons[platform];
          const platformPosts = posts.filter((p) => p.platform === platform);

          return (
            <div
              key={platform}
              className={`rounded-lg border bg-white ${config.border}`}
              style={{ borderTopWidth: 3 }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between border-b border-[#e0e0e0] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={config.color} />
                  <h2 className="text-[14px] font-semibold text-[#222]">
                    {config.label}
                  </h2>
                  <span className="rounded-full bg-[#f0f0f0] px-1.5 py-0.5 text-[11px] font-medium text-[#888]">
                    {platformPosts.length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingPost({
                      id: "",
                      platform,
                      title: "",
                      content: "",
                      date: new Date().toISOString().split("T")[0],
                      status: "draft",
                    });
                    setShowPostModal(true);
                  }}
                  className="rounded p-1 text-[#888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222]"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Posts */}
              <div className="divide-y divide-[#f0f0f0]">
                {platformPosts.length === 0 && (
                  <div className="px-4 py-6 text-center text-[12px] text-[#aaa]">
                    No drafts
                  </div>
                )}
                {platformPosts.map((post) => (
                  <div
                    key={post.id}
                    className="group px-4 py-3 transition-colors hover:bg-[#fafafa]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#222]">
                          {post.title}
                        </p>
                        {post.content && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-[#888] line-clamp-2">
                            {post.content}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] text-[#aaa]">
                            {post.date}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[post.status]}`}
                          >
                            {post.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingPost(post);
                            setShowPostModal(true);
                          }}
                          className="rounded p-1 text-[#888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222]"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => {
                            handleDeletePost(post.id);
                          }}
                          className="rounded p-1 text-[#888] transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b]"
                          title="Mark as sent & remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Modal */}
      {showPostModal && (
        <PostModal
          post={editingPost}
          onSave={handleSavePost}
          onClose={() => {
            setShowPostModal(false);
            setEditingPost(null);
          }}
        />
      )}
    </div>
  );
}

function PostModal({
  post,
  onSave,
  onClose,
}: {
  post: MarketingPost | null;
  onSave: (post: MarketingPost) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [platform, setPlatform] = useState<MarketingPlatform>(
    post?.platform ?? "linkedin"
  );
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "draft");
  const [date, setDate] = useState(
    post?.date ?? new Date().toISOString().split("T")[0]
  );

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave({
      id: post?.id ?? generateId(),
      platform,
      title: title.trim(),
      content: content.trim(),
      date,
      status,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-[#e0e0e0] bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#222]">
            {post ? "Edit Post" : "New Post"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#888] transition-colors hover:bg-[#f0f0f0]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#555]">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title..."
              className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-[#fafafa] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-8 text-[13px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#555]">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post..."
              rows={4}
              className="w-full resize-none rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Platform
              </label>
              <CustomSelect
                value={platform}
                onChange={(val) => setPlatform(val as MarketingPlatform)}
                options={(["linkedin", "nextdoor", "x"] as const).map((p) => ({
                  value: p,
                  label: platformConfig[p].label,
                }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Status
              </label>
              <CustomSelect
                value={status}
                onChange={(val) => setStatus(val as PostStatus)}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "published", label: "Published" },
                ]}
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#555]">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-[#fafafa] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-8 text-[13px] text-[#222] outline-none transition-colors focus:border-[#1a73e8] focus:bg-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="rounded-lg bg-[#111] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            {post ? "Save Changes" : "Create Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
