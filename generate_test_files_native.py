import zipfile
import os

def generate_docx():
    docx_path = "test_story.docx"
    
    # 1. [Content_Types].xml
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    # 2. _rels/.rels
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    # 3. word/document.xml
    document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">Mali decak i lepa knjiga. Decak cita novu knjigu svaki dan.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">On voli da uci srpski jezik u skoli. Njegov prijatelj takodje uci jezik i radi u gradu.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">Oni govore srpski veoma dobro. Danas je lep dan. Moci cemo da radimo i citamo u kuci.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>"""

    with zipfile.ZipFile(docx_path, 'w') as zipf:
        zipf.writestr("[Content_Types].xml", content_types)
        zipf.writestr("_rels/.rels", rels)
        zipf.writestr("word/document.xml", document_xml)
    print("test_story.docx generated natively.")

def generate_pdf():
    pdf_path = "test_story.pdf"
    
    # We will build a simple valid PDF structure
    objects = []
    
    def add_object(content):
        obj_id = len(objects) + 1
        objects.append((obj_id, content))
        return f"{obj_id} 0 R"
    
    # Object 1: Catalog
    # Object 2: Pages
    # Object 3: Page
    # Object 4: Font
    # Object 5: Content
    
    catalog_id = 1
    pages_id = 2
    page_id = 3
    font_id = 4
    content_id = 5
    
    # Prepare content stream
    text_content = (
        "BT\n"
        "/F1 12 Tf\n"
        "14 TL\n"
        "72 712 Td\n"
        "(Mali decak i lepa knjiga. Decak cita novu knjigu svaki dan.) Tj T*\n"
        "(On voli da uci srpski jezik u skoli. Njegov prijatelj takodje uci jezik i radi u gradu.) Tj T*\n"
        "(Oni govore srpski veoma dobro. Danas je lep dan. Moci cemo da radimo i citamo u kuci.) Tj T*\n"
        "ET"
    )
    
    objects.append((1, "<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append((2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"))
    objects.append((3, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"))
    objects.append((4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    
    content_bytes = text_content.encode('ascii')
    content_obj = f"<< /Length {len(content_bytes)} >>\nstream\n" + text_content + "\nendstream"
    objects.append((5, content_obj))
    
    # Write to file and calculate offsets
    offsets = {}
    current_offset = 0
    
    with open(pdf_path, 'wb') as f:
        # Header
        header = b"%PDF-1.4\n"
        f.write(header)
        current_offset += len(header)
        
        for obj_id, obj_text in objects:
            offsets[obj_id] = current_offset
            obj_bytes = f"{obj_id} 0 obj\n{obj_text}\nendobj\n".encode('ascii')
            f.write(obj_bytes)
            current_offset += len(obj_bytes)
            
        xref_start = current_offset
        
        # Xref table
        f.write(b"xref\n")
        f.write(f"0 {len(objects) + 1}\n".encode('ascii'))
        f.write(b"0000000000 65535 f \n")
        for obj_id in sorted(offsets.keys()):
            f.write(f"{offsets[obj_id]:010d} 00000 n \n".encode('ascii'))
            
        # Trailer
        f.write(b"trailer\n")
        f.write(f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n".encode('ascii'))
        f.write(b"startxref\n")
        f.write(f"{xref_start}\n".encode('ascii'))
        f.write(b"%%EOF\n")
        
    print("test_story.pdf generated natively.")

if __name__ == "__main__":
    generate_docx()
    generate_pdf()
