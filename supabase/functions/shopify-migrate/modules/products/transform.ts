import { numId } from "../../_shared/utils.ts";

export function cleanProduct(p: any) {
  const {
    id,
    admin_graphql_api_id,
    created_at,
    updated_at,
    published_at,
    ...rest
  } = p;
  if (rest.variants) {
    rest.variants = rest.variants.map((v: any) => {
      const {
        id: vid,
        product_id,
        admin_graphql_api_id: vg,
        created_at: vc,
        updated_at: vu,
        inventory_item_id,
        image_id,
        ...vr
      } = v;
      return vr;
    });
  }
  if (rest.images) {
    rest.images = rest.images.map((i: any) => ({
      src: i.src,
      alt: i.alt,
      position: i.position,
    }));
  }
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}

export function gqlToRestProduct(p: any): any {
  const variants =
    p.variants?.nodes?.map((v: any, i: number) => {
      const opts = v.selectedOptions || [];
      const weightUnit = v.inventoryItem?.measurement?.weight?.unit;
      let restWeightUnit = "kg";
      if (weightUnit === "GRAMS") restWeightUnit = "g";
      else if (weightUnit === "OUNCES") restWeightUnit = "oz";
      else if (weightUnit === "POUNDS") restWeightUnit = "lb";

      const r: any = {
        title: v.title,
        price: v.price ?? "0",
        compare_at_price: v.compareAtPrice ?? null,
        sku: v.sku ?? "",
        barcode: v.barcode ?? "",
        taxable: v.taxable ?? true,
        requires_shipping: v.inventoryItem?.requiresShipping ?? true,
        weight: v.inventoryItem?.measurement?.weight?.value ?? 0,
        weight_unit: restWeightUnit,
        inventory_quantity: 0,
      };
      if (opts[0]) r.option1 = opts[0].value;
      if (opts[1]) r.option2 = opts[1].value;
      if (opts[2]) r.option3 = opts[2].value;
      return r;
    }) ?? [];
  const images =
    p.images?.nodes?.map((img: any, i: number) => ({
      src: img.url,
      alt: img.altText ?? "",
      position: i + 1,
    })) ?? [];
  const img0 = images[0];
  return {
    id: numId(p.id),
    title: p.title ?? "",
    handle: p.handle ?? "",
    body_html: p.descriptionHtml ?? "",
    vendor: p.vendor ?? "",
    product_type: p.productType ?? "",
    tags: Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags ?? ""),
    status: p.status?.toLowerCase() ?? "active",
    template_suffix: p.templateSuffix ?? null,
    options: (p.options || []).map((o: any) => ({
      name: o.name,
      values: o.values || [],
    })),
    variants,
    images,
    image: img0 ? { src: img0.src, alt: img0.alt } : null,
  };
}
