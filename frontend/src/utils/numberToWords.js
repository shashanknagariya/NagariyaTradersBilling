
const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertHundred(num) {
    let str = '';
    if (num > 99) {
        str += units[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
    }
    if (num > 0) {
        if (num < 20) {
            str += units[num] + ' ';
        } else {
            str += tens[Math.floor(num / 10)] + ' ';
            if (num % 10 > 0) {
                str += units[num % 10] + ' ';
            }
        }
    }
    return str.trim();
}

export function numberToWords(amount) {
    if (!amount || isNaN(amount)) return 'Zero';

    // Round to 2 decimal places
    let num = Math.round(amount * 100) / 100;

    let whole = Math.floor(num);
    let fraction = Math.round((num - whole) * 100);

    // Convert whole part
    let str = '';

    if (whole === 0) str = 'Zero';
    else {
        // Indian Number System (Crores, Lakhs, Thousands)
        if (whole >= 10000000) {
            str += convertHundred(Math.floor(whole / 10000000)) + ' Crore ';
            whole %= 10000000;
        }
        if (whole >= 100000) {
            str += convertHundred(Math.floor(whole / 100000)) + ' Lakh ';
            whole %= 100000;
        }
        if (whole >= 1000) {
            str += convertHundred(Math.floor(whole / 1000)) + ' Thousand ';
            whole %= 1000;
        }
        if (whole > 0) {
            str += convertHundred(whole);
        }
    }

    str = str.trim();

    // Add Rupee/Rupees
    // We already have the string "Five Thousand", we want "Five Thousand Rupees"
    // But wait, the prompt says "INR <amount> Only" which implies "INR Five Thousand Only"
    // The user specifically asked for: "INRA <amount in words> only" (probably typo for INR)
    // "here you should write INRA <amount in words> only"
    // I will assume they meant "INR <words> Only".

    // Just return the words for the number. Caller will format.
    return str;
}
