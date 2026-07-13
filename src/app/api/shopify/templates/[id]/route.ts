import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUT /api/shopify/templates/[id]
// Body: { shop, name, subject, content: { blocks: [...] } }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    .update({
      name,
      subject: subject || "",
      content: content || { blocks: [] },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .select()
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, template });
}

// DELETE /api/shopify/templates/[id]
// Body: { shop }

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { shop } = await req.json();

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

  await supabaseAdmin
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopRow.id);

  return NextResponse.json({ success: true });
}
