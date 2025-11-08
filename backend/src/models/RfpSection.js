import mongoose from 'mongoose';

const RfpSectionSchema = new mongoose.Schema(
  {
    rfpId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rfp', required: true },
    index: Number,
    title: String,
    text: String,
    pageStart: Number,
    pageEnd: Number,
  },
  { timestamps: true }
);

export default mongoose.model('RfpSection', RfpSectionSchema);
