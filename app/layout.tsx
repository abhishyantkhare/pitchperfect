import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./context/Providers";

export const metadata: Metadata = {
  title: "ConvAI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={"h-full w-full dark"}>
      <body className={`antialiased w-full h-full lex flex-col`}>
        <div className="flex flex-col flex-grow w-full items-center justify-center">
          <Providers>
            {children}
          </Providers>
        </div>
      </body>
    </html>
  );
}
