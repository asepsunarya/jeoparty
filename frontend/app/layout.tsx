import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Jeoparty — Multiplayer Jeopardy for your party",
  description:
    "Create a Jeopardy board and play with friends in real-time. No sign-up required.",
  themeColor: "#060CE9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#060694",
              color: "#FFCC00",
              border: "1px solid rgba(255,204,0,0.3)",
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  );
}
