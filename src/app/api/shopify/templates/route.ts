import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/shopify/templates?shop=xxx
// Returns templates for the given shop.

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: templates, error } = await supabaseAdmin
    .from("templates")
    .select("*")
    .eq("shop_id", shopRow.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates });
}

// POST /api/shopify/templates
// Body: { shop, name, subject, content: { blocks: [...] } }

export async function POST(req: NextRequest) {
  const { shop, name, subject, content } = await req.json();

  if (!shop || !name) {
    return NextResponse.json({ error: "shop and name are required" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: template, error } = await supabaseAdmin
    .from("templates")
    .insert({
      shop_id: shopRow.id,
      name,
      subject: subject || "",
      content: content || { blocks: [] },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, template });
}
