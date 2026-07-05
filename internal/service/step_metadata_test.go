package service

import "testing"

func TestExtractStepMetadataReadsHeaderAndProducts(t *testing.T) {
	metadata, err := ExtractStepMetadata([]byte(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('FreeCAD Model'),'2;1');
FILE_NAME('Open CASCADE Shape Model','2026-07-04T23:41:33',(''),(''),'Open CASCADE STEP processor 7.8','FreeCAD','Unknown');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1 = PRODUCT('Compact_Retro_iPad_LCD_Case','Compact_Retro_iPad_LCD_Case','',(#2));
#2 = PRODUCT_CONTEXT('',#3,'mechanical');
#3 = APPLICATION_CONTEXT('core data');
#4 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );
ENDSEC;
END-ISO-10303-21;`))
	if err != nil {
		t.Fatalf("ExtractStepMetadata returned error: %v", err)
	}
	if metadata.Schema != "AUTOMOTIVE_DESIGN" {
		t.Fatalf("schema = %q, want AUTOMOTIVE_DESIGN", metadata.Schema)
	}
	if len(metadata.ProductNames) != 1 || metadata.ProductNames[0] != "Compact_Retro_iPad_LCD_Case" {
		t.Fatalf("product names = %+v", metadata.ProductNames)
	}
	if metadata.LengthUnit != "millimetre" {
		t.Fatalf("length unit = %q, want millimetre", metadata.LengthUnit)
	}
	if metadata.EntityCount != 4 {
		t.Fatalf("entity count = %d, want 4", metadata.EntityCount)
	}
}
