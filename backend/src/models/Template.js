import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    format: { type: String, enum: ['md', 'docx', 'html'], default: 'md' },
    variables: Object,
    sectionMap: Object, // { introduction: {...}, technical_approach: {...}, ... }
    sourceFileName: String,
  },
  { timestamps: true }
);

export default mongoose.model('Template', TemplateSchema);
