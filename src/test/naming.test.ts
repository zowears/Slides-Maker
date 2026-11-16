import { describe, it, expect } from 'vitest';
import { isReportLine, isPersonName, transliterateUrdu, sanitizeFilename, URDU_LOCATION_MAP } from '../lib/transliterate';
import { isNewsBlockId, parseNewsBlocks, smartSplitUrduText, suggestMetadata } from '../lib/newsroomEngine';

// Mock TEMPLATES
const TEMPLATES: Record<string, {name: string}> = {
    default: { name: 'Default' },
    reporterName: { name: 'Reporter' },
    nameBand: { name: 'Name Band' },
    addressBar: { name: 'Address Bar' }
};

interface BulkLine {
  text: string;
  templateId: string;
  templateName: string;
  isAutoDetected: boolean;
  newsCode?: string;
  exportSuffix?: string;
  exportName?: string;
}

const getLineTemplateId = (text: string) => {
  const trimmed = text.trim();
  if (/پاکستان[\s\p{P}]*$/u.test(trimmed)) return "addressBar";
  if (isReportLine(trimmed)) return "reporterName";
  if (isPersonName(trimmed)) return "nameBand";
  return "default";
};

const processTextToLines = (text: string, autoDetect: boolean): BulkLine[] => {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const processedLines: BulkLine[] = [];
  let currentNewsCode = "News";
  let alphabeticalIndex = 0;

  for (const line of rawLines) {
    const newsCodeMatch = line.match(/^(\d{8}-\d{3})$/);
    if (newsCodeMatch) {
      currentNewsCode = newsCodeMatch[1];
      alphabeticalIndex = 0;
      continue;
    }

    const templateId = autoDetect ? getLineTemplateId(line) : "default";
    let exportSuffix = "";
    let useNewsPrefix = true;

    if (autoDetect) {
      if (templateId === "addressBar") {
        const matches: string[] = [];
        Object.keys(URDU_LOCATION_MAP).forEach(urduKey => {
          if (line.includes(urduKey)) {
            matches.push(URDU_LOCATION_MAP[urduKey]);
          }
        });
        exportSuffix = matches[0] || "Address";
        useNewsPrefix = false;
      } else if (isReportLine(line)) {
        exportSuffix = "Report";
      } else if (isPersonName(line)) {
        exportSuffix = transliterateUrdu(line);
      } else {
        exportSuffix = String.fromCharCode(65 + alphabeticalIndex);
        alphabeticalIndex++;
      }
    } else {
      exportSuffix = String.fromCharCode(65 + alphabeticalIndex);
      alphabeticalIndex++;
    }

    const sanitizedSuffix = sanitizeFilename(exportSuffix);
    const exportName = useNewsPrefix 
      ? `${currentNewsCode}.${sanitizedSuffix}.png`
      : `${sanitizedSuffix}.png`;

    processedLines.push({
      text: line,
      templateId,
      templateName: TEMPLATES[templateId]?.name ?? templateId,
      isAutoDetected: autoDetect,
      newsCode: currentNewsCode,
      exportSuffix: sanitizedSuffix,
      exportName
    });
  }
  return processedLines;
};

describe('Full Block Parsing', () => {
  it('parses blocks and assigns smart names', () => {
    const testInput = `
20260908-002
مدرسۃ المدینہ میں شعبہ مدنی چینل عام کریں کے تحت مدنی چینل کی پروموشن کا سلسلہ
نگران مجلس پاکستان کاسنتوں بھرا بیان
محمد طاہر عطاری مدنی
حیدر خان درانی

20260908-003
ایک شخصیت کے گھرپر ایصال ثواب کے لیے قرآن خوانی اور سنتوں بھرا اجتماع
رپورٹ: محمود عطاری
`;

    const result = processTextToLines(testInput, true);
    
    expect(result).toHaveLength(6);
    
    // Block 20260908-002
    expect(result[0].exportName).toBe('20260908-002.A.png');
    expect(result[1].exportName).toBe('20260908-002.B.png');
    expect(result[2].exportName).toBe('20260908-002.Tahir.png');
    expect(result[3].exportName).toBe('20260908-002.HaiderKhan.png');
    
    // Block 20260908-003
    expect(result[4].exportName).toBe('20260908-003.A.png');
    expect(result[5].exportName).toBe('20260908-003.Report.png');

    // Address Bar
    const addressLine = processTextToLines('کراچی سندھ ، پاکستان', true);
    expect(addressLine[0].exportName).toBe('Karachi.png');
  });

  it('accepts only date-sequence block IDs', () => {
    expect(isNewsBlockId('20260908-002')).toBe(true);
    expect(isNewsBlockId('BF.475')).toBe(false);
    expect(isNewsBlockId('20260908-02')).toBe(false);

    const blocks = parseNewsBlocks('BF.475\nlegacy block\n20260908-002\nvalid block');
    expect(blocks).toEqual([
      { id: '20260908-002', originalText: '20260908-002\nvalid block' }
    ]);
    expect(smartSplitUrduText('20260908-002\nمتن')).toEqual(['متن']);
    expect(suggestMetadata('متن', blocks[0].id, 0, 1).exportName).toBe('20260908-002.A.png');
  });
});
