import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="h-full bg-slate-100">
      <Head>
        <title>SiteFlow — Construction Site Management</title>
        <meta name="description" content="SiteFlow — all-in-one construction site management: tasks, workforce, attendance, invoicing and reports." />
      </Head>
      <body className="h-full">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
