import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    role?: "viewer" | "lead" | "manager" | "admin";
    roleAt?: number;
  }
}
