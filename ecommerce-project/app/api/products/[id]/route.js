// app/api/products/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Support lookup by ObjectId or slug
async function findProduct(id) {
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    return Product.findById(id);
  }
  return Product.findOne({ slug: id });
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const product = await findProduct(params.id);
    
    if (!product || !product.isActive) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 401 }
      );
    }

    const product = await findProduct(params.id);
    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Prevent slug modification
    if (body.slug && body.slug !== product.slug) {
      return NextResponse.json(
        { success: false, message: "Product slug cannot be modified" },
        { status: 400 }
      );
    }

    // Whitelist updatable fields
    const allowedFields = [
      "name",
      "description",
      "price",
      "discountPrice",
      "category",
      "stock",
      "images",
    ];
    
    const updates = {};
    allowedFields.forEach((field) => {
      if (field in body) {
        updates[field] = body[field];
      }
    });

    const updated = await Product.findByIdAndUpdate(product._id, updates, {
      new: true,
      runValidators: true,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error.name === "ValidationError") {
      return NextResponse.json(
        {
          success: false,
          message: "Validation failed",
          errors: Object.values(error.errors).map((e) => e.message),
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 401 }
      );
    }

    const product = await findProduct(params.id);
    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 }
      );
    }

    // Soft delete: mark as inactive instead of hard delete
    const deleted = await Product.findByIdAndUpdate(
      product._id,
      { isActive: false },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      data: { message: "Product deleted successfully" },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}