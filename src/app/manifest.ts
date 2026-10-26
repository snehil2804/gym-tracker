import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rep Ledger",
    short_name: "Rep Ledger",
    description: "Gym membership, PT package, attendance and workout tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#18160f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
