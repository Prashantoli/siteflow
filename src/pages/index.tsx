import { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { homeFor } from "@/lib/rbac";

export default function Home() {
  return null;
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  return { redirect: { destination: homeFor(session.user.role), permanent: false } };
}
