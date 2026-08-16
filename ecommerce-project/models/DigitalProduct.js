// models/DigitalProduct.js
import mongoose from "mongoose";

const digitalProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    fileUrl: { type: String, required: true }, // Cloudinary e uploaded file
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 }, // bytes
    fileType: { type: String, default: "" }, // pdf / zip / epub...
    active: { type: Boolean, default: true },
    downloads: { type: Number, default: 0 }, // koto bar download hoyeche
  },
  { timestamps: true }
);

export default mongoose.models.DigitalProduct || mongoose.model("DigitalProduct", digitalProductSchema);