"use client";

import { useState, useRef } from "react";
import { Upload, FileText, X, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadCardReceipt } from "@/app/actions";
import { toast } from "sonner";
import type { CardReceiptSlim } from "../../finances-client";

interface ReceiptUploadProps {
  mercuryTransactionId: string;
  creditCardId: string;
  existingReceipt: CardReceiptSlim | null;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function ReceiptUpload({
  mercuryTransactionId,
  creditCardId,
  existingReceipt,
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, and PDF files are accepted");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `receipts/${mercuryTransactionId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("card-receipts")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("card-receipts")
        .getPublicUrl(path);

      await uploadCardReceipt({
        mercuryTransactionId,
        creditCardId,
        fileUrl: urlData.publicUrl,
      });

      toast.success("Receipt uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (existingReceipt) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={existingReceipt.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md bg-[#f5f5f5] px-2 py-1 text-[11px] text-[#555] hover:bg-[#e8e8e8]"
        >
          <FileText size={12} />
          View Receipt
          <Download size={10} />
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-[11px] text-[#999] hover:text-[#555]"
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Replace"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 rounded-md border border-dashed border-[#d0d0d0] px-2 py-1 text-[11px] text-[#888] hover:border-[#999] hover:text-[#555] disabled:opacity-50"
      >
        <Upload size={12} />
        {uploading ? "Uploading..." : "Upload Receipt"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
