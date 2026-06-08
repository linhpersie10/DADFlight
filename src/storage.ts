import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch 
} from "firebase/firestore";
import { db } from "./firebase";
import type { FlightDataset, FlightLeg } from "./types";

/**
 * Lưu trữ báo cáo bay và các leg bay lên Firestore.
 * Tránh giới hạn 1MB của Firestore bằng cách tách records thành subcollection con.
 */
export async function saveDatasetToCloud(dataset: FlightDataset): Promise<void> {
  const datasetRef = doc(db, 'PKT_DAD_datasets', dataset.id);
  
  // 1. Xóa toàn bộ các leg bay cũ trong subcollection 'legs' nếu có (phục vụ trường hợp upload lại báo cáo)
  const legsRef = collection(db, 'PKT_DAD_datasets', dataset.id, 'legs');
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

  // 2. Lưu metadata document (loại bỏ trường records ra để tránh quá tải dung lượng 1MB)
  const { records, ...metadata } = dataset;
  await setDoc(datasetRef, {
    ...metadata,
    updatedAt: new Date().toISOString()
  });
  
  // 3. Lưu các leg bay vào subcollection con dưới dạng chunk 400 tài liệu để tối ưu Firestore write limits
  const BATCH_SIZE = 400;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(leg => {
      const legRef = doc(db, 'PKT_DAD_datasets', dataset.id, 'legs', leg.id);
      batch.set(legRef, leg);
    });
    await batch.commit();
  }
}

/**
 * Xóa một báo cáo bay cùng toàn bộ danh sách các leg liên quan từ Firestore.
 */
export async function deleteDatasetFromCloud(datasetId: string): Promise<void> {
  // 1. Lấy và xóa sạch các tài liệu trong subcollection legs theo batch
  const legsRef = collection(db, 'PKT_DAD_datasets', datasetId, 'legs');
  const legsSnap = await getDocs(legsRef);
  
  const BATCH_SIZE = 400;
  const docs = legsSnap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(d => {
      batch.delete(d.ref);
    });
    await batch.commit();
  }
  
  // 2. Xóa tài liệu metadata chính
  const datasetRef = doc(db, 'PKT_DAD_datasets', datasetId);
  await deleteDoc(datasetRef);
}

/**
 * Tải danh sách leg bay của một báo cáo cụ thể từ Firestore.
 */
export async function fetchDatasetLegs(datasetId: string): Promise<FlightLeg[]> {
  const legsRef = collection(db, 'PKT_DAD_datasets', datasetId, 'legs');
  const legsSnap = await getDocs(legsRef);
  const legs = legsSnap.docs.map(doc => doc.data() as FlightLeg);
  // Sắp xếp các leg bay theo sourceRow ban đầu để đảm bảo tính liên tục của dữ liệu Excel gốc
  return legs.sort((a, b) => a.sourceRow - b.sourceRow);
}
