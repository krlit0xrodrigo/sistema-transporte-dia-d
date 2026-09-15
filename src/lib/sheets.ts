import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

/**
 * Devuelve una instancia autenticada de GoogleSpreadsheet.
 */
async function getAuthenticatedDoc(spreadsheetId: string) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error("Las credenciales de Google Service Account no están configuradas en el entorno.");
  }

  // Soporte para saltos de línea escapados en el .env
  key = key.replace(/\\n/g, "\n");

  const serviceAccountAuth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

/**
 * Lee todas las filas de la primera hoja o de una hoja específica por su índice/título.
 */
export async function readSheet(spreadsheetId: string, sheetIndexOrTitle: number | string = 0) {
  const doc = await getAuthenticatedDoc(spreadsheetId);
  
  let sheet;
  if (typeof sheetIndexOrTitle === "number") {
    sheet = doc.sheetsByIndex[sheetIndexOrTitle];
  } else {
    sheet = doc.sheetsByTitle[sheetIndexOrTitle];
  }

  if (!sheet) {
    throw new Error(`Hoja ${sheetIndexOrTitle} no encontrada en el documento.`);
  }

  const rows = await sheet.getRows();
  
  // Convertimos las filas a un array de objetos con las keys de los headers
  const data = rows.map(row => {
    const obj: Record<string, any> = {};
    sheet.headerValues.forEach(header => {
      obj[header] = row.get(header);
    });
    return obj;
  });

  return data;
}

/**
 * Escribe datos (sobreescribiendo) en una nueva hoja o en una hoja existente por título.
 */
export async function writeSheet(spreadsheetId: string, title: string, data: Record<string, any>[]) {
  if (data.length === 0) return;

  const doc = await getAuthenticatedDoc(spreadsheetId);
  const headerValues = Object.keys(data[0]);

  let sheet = doc.sheetsByTitle[title];

  if (!sheet) {
    // Crear nueva hoja
    sheet = await doc.addSheet({ title, headerValues });
  } else {
    // Si ya existe, limpiamos y actualizamos cabeceras
    await sheet.clear();
    await sheet.setHeaderRow(headerValues);
  }

  // Agregamos todas las filas
  await sheet.addRows(data);
}
