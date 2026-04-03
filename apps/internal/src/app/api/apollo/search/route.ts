import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface ApolloPersonResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  location: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Apollo API key not configured. Add APOLLO_API_KEY to your environment variables." },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { personTitles, companyName, location, perPage } = body;

  try {
    const apolloBody: Record<string, unknown> = {
      per_page: Math.min(perPage || 25, 100),
    };

    if (personTitles?.length) {
      apolloBody.person_titles = personTitles;
    }
    if (companyName) {
      apolloBody.q_organization_name = companyName;
    }
    if (location) {
      apolloBody.person_locations = [location];
    }

    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(apolloBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Apollo API] Search failed:", res.status, errText);
      return NextResponse.json(
        { error: `Apollo API error: ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    const people: ApolloPersonResult[] = (data.people || []).map(
      (p: Record<string, unknown>) => {
        const org = p.organization as Record<string, unknown> | undefined;
        const phones = p.phone_numbers as Array<{ raw_number?: string }> | undefined;

        return {
          id: p.id as string,
          firstName: (p.first_name as string) || "",
          lastName: (p.last_name as string) || "",
          email: (p.email as string) || null,
          phone: phones?.[0]?.raw_number || null,
          title: (p.title as string) || null,
          company: (org?.name as string) || null,
          companyDomain: (org?.website_url as string) || null,
          linkedinUrl: (p.linkedin_url as string) || null,
          location: (p.city as string) || null,
        };
      },
    );

    return NextResponse.json({
      people,
      totalResults: data.pagination?.total_entries ?? people.length,
    });
  } catch (error) {
    console.error("[Apollo API] Search error:", error);
    return NextResponse.json({ error: "Failed to search Apollo" }, { status: 500 });
  }
}
