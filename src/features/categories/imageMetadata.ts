const decodeChunkType = (view: DataView, offset: number) =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );

const decodeTextChunk = (bytes: Uint8Array) => {
  const separator = bytes.indexOf(0);
  if (separator < 0) {
    return null;
  }

  const key = new TextDecoder('latin1').decode(bytes.slice(0, separator));
  const value = new TextDecoder('utf-8').decode(bytes.slice(separator + 1));
  return { key, value };
};

const decodeInternationalTextChunk = (bytes: Uint8Array) => {
  let index = bytes.indexOf(0);
  if (index < 0) {
    return null;
  }

  const key = new TextDecoder('latin1').decode(bytes.slice(0, index));
  let cursor = index + 1;
  if (cursor + 2 > bytes.length) {
    return null;
  }

  const compressionFlag = bytes[cursor];
  cursor += 2;

  index = bytes.indexOf(0, cursor);
  if (index < 0) {
    return null;
  }
  cursor = index + 1;

  index = bytes.indexOf(0, cursor);
  if (index < 0) {
    return null;
  }
  cursor = index + 1;

  if (compressionFlag !== 0) {
    return null;
  }

  const value = new TextDecoder('utf-8').decode(bytes.slice(cursor));
  return { key, value };
};

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

export const extractPngTextValue = async (file: File, keyName: string) => {
  const content = await file.arrayBuffer();
  const view = new DataView(content);

  if (view.byteLength < 8) {
    return '';
  }

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (view.getUint8(index) !== signature[index]) {
      return '';
    }
  }

  let cursor = 8;
  while (cursor + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(cursor);
    const chunkType = decodeChunkType(view, cursor + 4);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd + 4 > view.byteLength) {
      break;
    }

    const bytes = new Uint8Array(content.slice(dataStart, dataEnd));
    if (chunkType === 'tEXt') {
      const parsed = decodeTextChunk(bytes);
      if (parsed?.key === keyName) {
        return parsed.value;
      }
    }
    if (chunkType === 'iTXt') {
      const parsed = decodeInternationalTextChunk(bytes);
      if (parsed?.key === keyName) {
        return parsed.value;
      }
    }

    cursor = dataEnd + 4;
  }

  return '';
};

export const parseA1111Parameters = (parametersText: string) => {
  const lines = (parametersText || '').split('\n');
  if (lines.length === 0) {
    return { positive: '', negative: '' };
  }

  const positive = lines[0].trim();
  let negative = '';
  for (const line of lines.slice(1)) {
    if (line.startsWith('Negative prompt: ')) {
      negative = line.replace('Negative prompt: ', '').trim();
      break;
    }
  }

  return { positive, negative };
};

export const mergePrompts = (existingValue: string, incomingValue: string) => {
  const existing = existingValue.trim();
  const incoming = incomingValue.trim();

  if (!incoming) {
    return existing;
  }
  if (!existing) {
    return incoming;
  }
  if (existing.includes(incoming)) {
    return existing;
  }

  return `${existing}, ${incoming}`;
};
