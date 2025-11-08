import mongoose from 'mongoose';

const RfpSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sourceFileName: String,
    sourceFileType: String,
    ingestMetadata: Object,
  },
  { timestamps: true }
);

export default mongoose.model('Rfp', RfpSchema);
