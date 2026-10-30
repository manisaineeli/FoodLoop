const markdownpdf = require('markdown-pdf');
const fs = require('fs');

markdownpdf()
  .from('FoodLoop_Class_Diagram_Guide.md')
  .to('FoodLoop_Class_Diagram_Guide.pdf', function () {
    console.log('PDF created successfully: FoodLoop_Class_Diagram_Guide.pdf');
  });