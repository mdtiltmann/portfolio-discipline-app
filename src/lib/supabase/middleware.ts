import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Single-user personal app: there is no sign-up/login UI. If no session
  // cookie is present yet, silently authenticate as the one account this
  // app is deployed for, using credentials that only exist server-side.
  // Anyone who can reach this URL is treated as that user — there is no
  // further access gate, by the owner's explicit choice.
  if (!user && process.env.SITE_AUTH_EMAIL && process.env.SITE_AUTH_PASSWORD) {
    await supabase.auth.signInWithPassword({
      email: process.env.SITE_AUTH_EMAIL,
      password: process.env.SITE_AUTH_PASSWORD,
    });
  }

  return supabaseResponse;
}
