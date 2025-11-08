import mongoose from 'mongoose';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/rfp_proposals';

mongoose.set('strictQuery', true);

mongoose
  .connect(uri, { dbName: uri.split('/').pop() })
  .then(() => console.log('[mongo] connected'))
  .catch((err) => console.error('[mongo] connection error', err));

export default mongoose;