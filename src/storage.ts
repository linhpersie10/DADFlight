import { 
  collection,
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import type { FlightDataset, FlightLeg } from "./types";

/**
 * Lưu trữ báo cáo bay và các leg bay lên Firestore.
 * Gom toàn bộ records thành 1 document duy nhất trong collection 'PKT_DAD_dataset_records'
 * để giảm thiểu tối đa chi phí đọc ghi.
 */
export async function saveDatasetToCloud(dataset: FlightDataset): Promise<void> {
  const datasetRef = doc(db, 'PKT_DAD_datasets', dataset.id);
  const recordsRef = doc(db, 'PKT_DAD_dataset_records', dataset.id);
  
  // 1. Lưu metadata và records đồng thời qua batch để tránh race condition
  // khi onSnapshot kích hoạt trước khi records được lưu
  const { records, ...metadata } = dataset;
  const updatedAt = new Date().toISOString();
  
  const batch = writeBatch(db);
  batch.set(recordsRef, { records });
  batch.set(datasetRef, { ...metadata, updatedAt });
  
  await batch.commit();
}

/**
 * Xóa một báo cáo bay cùng toàn bộ danh sách các leg liên quan từ Firestore.
 */
export async function deleteDatasetFromCloud(datasetId: string): Promise<void> {
  // 1. Xóa tài liệu records mới (nếu có)
  const recordsRef = doc(db, 'PKT_DAD_dataset_records', datasetId);
  await deleteDoc(recordsRef);
  
  // 2. Xóa chặng bay trong subcollection legs cũ (nếu có) để tương thích ngược
  const legsRef = collection(db, 'PKT_DAD_datasets', datasetId, 'legs');
  const legsSnap = await getDocs(legsRef);
  if (!legsSnap.empty) {
    const docs = legsSnap.docs;
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  }
  
  // 3. Xóa tài liệu metadata chính
  const datasetRef = doc(db, 'PKT_DAD_datasets', datasetId);
  await deleteDoc(datasetRef);
}

/**
 * Tải danh sách leg bay của một báo cáo cụ thể từ Firestore.
 */
export async function fetchDatasetLegs(datasetId: string): Promise<FlightLeg[]> {
  const recordsRef = doc(db, 'PKT_DAD_dataset_records', datasetId);
  const docSnap = await getDoc(recordsRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (data.records && Array.isArray(data.records)) {
      const legs = data.records as FlightLeg[];
      return legs.sort((a, b) => a.sourceRow - b.sourceRow);
    }
  }
  
  // Fallback: Tải từ subcollection 'legs' của dữ liệu cũ (tương thích ngược)
  const legsRef = collection(db, 'PKT_DAD_datasets', datasetId, 'legs');
  const legsSnap = await getDocs(legsRef);
  if (!legsSnap.empty) {
    const legs = legsSnap.docs.map(doc => doc.data() as FlightLeg);
    return legs.sort((a, b) => a.sourceRow - b.sourceRow);
  }
  
  return [];
}
