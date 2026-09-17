import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="spl-page-enter">{children}</div>;
}
