import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getImageStorageUsage, listStoredImages } from "@/lib/item-images";
import Header from "@/components/Header";
import AutoRefresh from "@/components/AutoRefresh";
import AdminImageManager from "@/components/AdminImageManager";

export const dynamic = "force-dynamic";

export default async function AdminImagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/list");
  const usage = getImageStorageUsage();
  const images = listStoredImages();
  return (
    <div className="spl-shell">
      <Header user={user} />
      <AutoRefresh />
      <main className="spl-main"><AdminImageManager usage={usage} images={images} /></main>
      <footer className="spl-footer"><Link href="/admin" className="spl-link-muted">Back to admin</Link></footer>
    </div>
  );
}
