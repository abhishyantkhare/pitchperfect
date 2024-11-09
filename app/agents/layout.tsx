import React, { Suspense } from "react";

// TODO: Delete this file once page.tsx moves it's router logic to components

const Loading = () => <div>Loading...</div>;

export default function AgentsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
