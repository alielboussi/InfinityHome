import * as XLSX from "xlsx";

// Generate template workbook
const wb = XLSX.utils.book_new();

// Products sheet
const productsHeaders = [
  "name", "sku", "sku_type", "cost_price", "price", "promotional_price", "promo_start_date", "promo_end_date", "currency", "category_id", "unit_of_measure_id"
];
const productsSheet = XLSX.utils.aoa_to_sheet([productsHeaders]);
XLSX.utils.book_append_sheet(wb, productsSheet, "Products");

// Sets sheet
const setsHeaders = [
  "set_name", "set_price", "standard_price", "promotional_price_set", "promo_start_date_set", "promo_end_date_set", "sku_set", "picture_url", "items"
];
const setsSheet = XLSX.utils.aoa_to_sheet([setsHeaders]);
XLSX.utils.book_append_sheet(wb, setsSheet, "Sets");

// Locations sheet
const locationsHeaders = ["name", "address", "city"];
const locationsSheet = XLSX.utils.aoa_to_sheet([locationsHeaders]);
XLSX.utils.book_append_sheet(wb, locationsSheet, "Locations");

// Categories sheet
const categoriesHeaders = ["name"];
const categoriesSheet = XLSX.utils.aoa_to_sheet([categoriesHeaders]);
XLSX.utils.book_append_sheet(wb, categoriesSheet, "Categories");

// UnitsOfMeasure sheet
const unitsHeaders = ["name", "abbreviation"];
const unitsSheet = XLSX.utils.aoa_to_sheet([unitsHeaders]);
XLSX.utils.book_append_sheet(wb, unitsSheet, "UnitsOfMeasure");

// Write file
XLSX.writeFile(wb, "import_template.xlsx");
