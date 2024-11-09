import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConvAI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={"h-full w-full"}>
      <body className={`antialiased w-full h-full lex flex-col`}>
        <div className="flex flex-col flex-grow w-full items-center justify-center sm:px-4">
          {children}
        </div>
      </body>
    </html>
  );
}
