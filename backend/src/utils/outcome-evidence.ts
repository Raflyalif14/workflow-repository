import path from 'node:path';
export function validateOutcomeEvidenceFiles(files: Express.Multer.File[]) {
  if (!files.length || files.length > 10) throw Error('Attach between 1 and 10 evidence files.');
  for (const file of files) {
    const ext = path.extname(file.originalname).slice(1).toLowerCase(), bytes = file.buffer;
    const valid = ext === 'pdf' ? bytes.subarray(0,5).toString() === '%PDF-'
      : ext === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : ext === 'jpg' || ext === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : ext === 'doc' ? bytes.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]))
      : ext === 'docx' ? bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])) : false;
    if (!valid || !file.size || file.size > 50*1024*1024 || bytes.length !== file.size) throw Error('Evidence must be JPG, JPEG, PNG, PDF, DOC, or DOCX, at most 50 MB.');
    file.mimetype = ({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'} as Record<string,string>)[ext];
  }
}
