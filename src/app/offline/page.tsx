import ShoppingApp from "@/components/ShoppingApp";

// Generic HTML only. No authenticated information may enter this precache.
export default function OfflinePage() { return <ShoppingApp initialView="fallback" />; }
