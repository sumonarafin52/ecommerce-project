// app/api/products/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { generateSlug } from "@/lib/utils";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "12"));

    const query = { isActive: true };
    if (category) query.category = category.trim();
    if (search) query.name = { $regex: search.trim(), $options: "i" };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: { products, total, page, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 401 }
      );
    }

    const { name, description, price, discountPrice, category, stock, images } = await request.json();

    // Input validation
    const trimmedName = name?.trim();
    const trimmedCategory = category?.trim();
    const trimmedDescription = description?.trim();

    if (!trimmedName || !trimmedCategory) {
      return NextResponse.json(
        { success: false, message: "Name and category are required" },
        { status: 400 }
      );
    }

    if (typeof price !== "number" || price < 0) {
      return NextResponse.json(
        { success: false, message: "Price must be a positive number" },
        { status: 400 }
      );
    }

    if (images && !Array.isArray(images)) {
      return NextResponse.json(
        { success: false, message: "Images must be an array" },
        { status: 400 }
      );
    }

    // Generate unique slug
    let slug = generateSlug(trimmedName);
    let counter = 1;
    let uniqueSlug = slug;

    while (await Product.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }

    const product = await Product.create({
      name: trimmedName,
      slug: uniqueSlug,
      description: trimmedDescription || "",
      price,
      discountPrice: discountPrice || 0,
      category: trimmedCategory,
      stock: stock || 0,
      images: images || [],
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}