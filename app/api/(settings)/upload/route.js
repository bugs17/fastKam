import { NextResponse } from "next/server";
import path, { join } from 'path';
import { readFile, writeFile } from "fs/promises";
import * as XLSX from 'xlsx';
import { prisma } from "@/app/lib/db";


function formatPhoneNumber(input) {
    if (!input) return '';

    // Konversi input ke string jika input adalah angka
    const inputStr = typeof input === 'number' ? input.toString() : input;

    // Hapus semua karakter yang bukan angka (0-9)
    let cleanedInput = inputStr.replace(/\D/g, '');

    // Cek apakah input dimulai dengan '62' atau '+62' dan ubah menjadi '0'
    if (cleanedInput.startsWith('62')) {
        cleanedInput = '0' + cleanedInput.slice(2);
    }

    // Cek apakah input dimulai dengan '8' (misalnya dari CSV), dan tambahkan '0' di depannya
    if (cleanedInput.startsWith('8')) {
        cleanedInput = '0' + cleanedInput;
    }

    // Pastikan nomor yang sudah diformat panjangnya 12-13 digit
    if (cleanedInput.length < 10 || cleanedInput.length > 13) {
        return ''; // Return empty if number doesn't meet valid length criteria
    }

    // Kembalikan nomor yang sudah diformat
    return cleanedInput;
}


export const POST = async (request) => {
    try {
        const data = await request.formData()
        const file = data.get('file')

        if (!file) {
            return NextResponse.json({"messaage":"No file"}, {status:400})
        }
        
        const fileType = file.type;
        const bytes = await file.arrayBuffer()
        const bufferFile = Buffer.from(bytes)

        const filePath = join(process.cwd(), 'public/kontak', file.name);
        await writeFile(filePath, bufferFile)

        const fileKontak = await readFile(filePath)

        let jsonData;

        // cek type file
        if (fileType === 'text/csv' || file.name.endsWith('.csv')) {
            // jika file bertype csv
            const fileKontakString = fileKontak.toString('utf-8');
            const workbook = XLSX.read(fileKontakString, { type: "string" });
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        }else if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')) {
            // jika file bertype xlsx
            const workbook = XLSX.read(fileKontak, {type:"buffer"})
            const worksheet = workbook.Sheets['Sheet1'];
            jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        }else{
            return NextResponse.json({ message: 'Format file tidak di dukung' }, { status: 500 });
        }



        const addData = async (nope) => {
            try {
                await prisma.kontak.create({
                    data:{
                        nope:nope
                    }
                })
            } catch (error) {
                console.log(`gagal add data kontak dari file ${filePath}`, error)
            }
        }

        let kontakExist;
        try {
            // Mendapatkan data kontak yang sudah ada dari database
            kontakExist = await prisma.kontak.findMany();
        } catch (error) {
            console.log("Gagal mengambil semua data kontak", error)
            return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
        }

        // Melakukan loop pada data yang diambil dari file (jsonData)
        await Promise.all(
            jsonData
                .filter(item => item[0] && (typeof item[0] === 'number' || typeof item[0] === 'string'))
                .map( async (item) => {
                    let noKontak;
        
                    // Cek apakah item tidak undefined
                    if (item !== undefined) {
                        noKontak = item[0];
        
                        // Format nomor kontak menggunakan fungsi formatPhoneNumber
                        const cleanKontak = formatPhoneNumber(noKontak);
        
                        // Cek apakah nomor kontak sudah ada di database
                        const kontakSudahAda = kontakExist.some(kontak => cleanKontak === kontak.nope);
        
                        if (!kontakSudahAda && cleanKontak !== '') {
                            await addData(cleanKontak)
                        }
                    }
                })
            );
        


        return NextResponse.json({ message: 'File uploaded and saved successfully' }, { status: 200 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Error processing the file' }, { status: 500 });
    }
};
