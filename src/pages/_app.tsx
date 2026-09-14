import "../styles/globals.css";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import LocationSharer from "@/components/LocationSharer";

const AUTH_PAGES = ["/login"];

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const isAuthPage = AUTH_PAGES.includes(router.pathname);

  return (
    <SessionProvider session={session}>
      {!isAuthPage && <LocationSharer />}
      <Component {...pageProps} />
    </SessionProvider>
  );
}
