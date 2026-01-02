import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, TextInput, ScrollView } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
import client from '../api/client';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { numberToWords } from '../utils/numberToWords';

const GST_STATE_CODES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
    "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar",
    "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman and Diu", "26": "Dadra and Nagar Haveli", "27": "Maharashtra",
    "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
    "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana",
    "37": "Andhra Pradesh (New)", "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction"
};

const BillViewScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { userInfo } = useAuth();
    const { t } = useLanguage();
    const isAdmin = userInfo?.role === 'admin';
    const { transactionId } = route.params;

    const [billData, setBillData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [htmlContent, setHtmlContent] = useState('');

    // Master Data Maps
    const [grains, setGrains] = useState({});
    const [contacts, setContacts] = useState({});
    const [warehouses, setWarehouses] = useState({});

    // Payment History
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [bankData, setBankData] = useState(null);

    // Aggregates
    const [totalQty, setTotalQty] = useState(0);
    const [totalAmt, setTotalAmt] = useState(0);
    const [mainTrx, setMainTrx] = useState(null);
    const [showProfit, setShowProfit] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (mainTrx && !loading) {
            const html = generateHtml();
            setHtmlContent(html);
        }
    }, [mainTrx, loading, billData, grains, contacts, warehouses, paymentHistory, bankData]);

    const fetchData = async () => {
        try {
            const [tRes, gRes, cRes, wRes, pRes, bRes] = await Promise.all([
                client.get(`/transactions/bill/${transactionId}`),
                client.get('/master/grains'),
                client.get('/master/contacts'),
                client.get('/master/warehouses'),
                client.get(`/transactions/${transactionId}/payments`),
                client.get('/master/bank-details')
            ]);

            // Map Master Data
            const gMap = {}; gRes.data.forEach(g => gMap[g.id] = g);
            const cMap = {}; cRes.data.forEach(c => cMap[c.id] = c);
            const wMap = {}; wRes.data.forEach(w => wMap[w.id] = w);

            setGrains(gMap);
            setContacts(cMap);
            setWarehouses(wMap);
            setBillData(tRes.data);
            setPaymentHistory(pRes.data);
            setBankData(bRes.data);

            // Calculations
            if (tRes.data.length > 0) {
                const main = tRes.data[0];
                setMainTrx(main);

                const tQty = tRes.data.reduce((sum, item) => sum + item.quantity_quintal, 0);
                const tAmt = tRes.data.reduce((sum, item) => sum + item.total_amount, 0);

                setTotalQty(tQty);
                setTotalAmt(tAmt);
            }

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load bill details");
        } finally {
            setLoading(false);
        }
    };

    const generateHtml = () => {
        if (!mainTrx) return '';
        const contact = contacts[mainTrx.contact_id] || {};
        const grain = grains[mainTrx.grain_id] || {};
        const isPurchase = mainTrx.type === 'purchase';

        // State & GST Logic
        const getState = (gst) => {
            if (!gst || gst.length < 2) return { name: "Madhya Pradesh", code: "23" };
            const code = gst.substring(0, 2);
            return { name: GST_STATE_CODES[code] || "Unknown", code };
        };

        const myState = { name: "Madhya Pradesh", code: "23" };
        const partyState = isPurchase ? myState : getState(contact.gst_number);

        // Tax Logic
        const taxPercent = mainTrx.tax_percentage || 0;
        // Backend stores Total Amount = Basic + Tax.
        // So Basic = Total / (1 + Rate/100)
        const grandTotal = totalAmt;
        const taxableAmount = grandTotal / (1 + (taxPercent / 100));
        const totalTax = grandTotal - taxableAmount;

        const isIntraState = (partyState.code === '23');

        // Rows HTML
        const rowsHtml = billData.map((item, index) => {
            // const wh = warehouses[item.warehouse_id]?.name || 'Unknown'; // User requested to remove warehouse name
            const bharti = (item.number_of_bags && item.quantity_quintal)
                ? ((item.quantity_quintal * 100) / item.number_of_bags).toFixed(2)
                : '-';

            return `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>${grain.name} (${grain.hindi_name || ''})</td>
                    <td style="text-align: center;">${item.number_of_bags || '-'}</td>
                    <td style="text-align: center;">${bharti}</td>
                    <td style="text-align: right;">${item.quantity_quintal.toFixed(2)} QTL</td>
                    <td style="text-align: right;">${item.rate_per_quintal.toFixed(2)}</td>
                    <td style="text-align: right;">${(item.quantity_quintal * item.rate_per_quintal).toFixed(2)}</td>
                </tr>
             `;
        }).join('');

        // Payment History Rows
        let paymentRows = '';
        if (paymentHistory.length > 0) {
            paymentRows = paymentHistory.map(p => `
                <tr>
                    <td colspan="6" class="text-right small">${t('paid')} ${new Date(p.date).toLocaleDateString()}</td>
                    <td class="text-right small">${p.amount.toFixed(2)}</td>
                </tr>
            `).join('');
        }

        // Tax Rows
        let taxRows = '';
        if (taxPercent > 0) {
            if (isIntraState) {
                // CGST + SGST (Half each)
                const halfTax = totalTax / 2;
                const halfRate = taxPercent / 2;
                taxRows = `
                    <tr>
                        <td colspan="6" class="text-right bold">CGST (${halfRate}%)</td>
                        <td class="text-right">${halfTax.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="6" class="text-right bold">SGST (${halfRate}%)</td>
                        <td class="text-right">${halfTax.toFixed(2)}</td>
                    </tr>
                `;
            } else {
                // IGST (Full)
                taxRows = `
                    <tr>
                        <td colspan="6" class="text-right bold">IGST (${taxPercent}%)</td>
                        <td class="text-right">${totalTax.toFixed(2)}</td>
                    </tr>
                `;
            }
        }

        const transportTable = isPurchase ? `
            <table class="no-border" style="width: 100%">
                 <tr>
                    <td class="no-border">Invoice No.<br/><b>${mainTrx.invoice_number || '-'}</b></td>
                    <td class="no-border">Dated<br/><b>${new Date(mainTrx.date).toLocaleDateString()}</b></td>
                </tr>
                 <tr>
                    <td class="no-border">Notes<br/>${mainTrx.notes || '-'}</td>
                    <td class="no-border"></td>
                </tr>
            </table>
        ` : `
             <table class="no-border" style="width: 100%">
                <tr>
                    <td class="no-border">Invoice No.<br/><b>${mainTrx.invoice_number || '-'}</b></td>
                    <td class="no-border">Dated<br/><b>${new Date(mainTrx.date).toLocaleDateString()}</b></td>
                </tr>
                <tr>
                    <td class="no-border">Transporter Name<br/>${mainTrx.transporter_name || '-'}</td>
                    <td class="no-border">Vehicle No.<br/>${mainTrx.vehicle_number || '-'}</td>
                </tr>
                <tr>
                    <td class="no-border">Driver Name<br/>${mainTrx.driver_name || '-'}</td>
                    <td class="no-border">Destination<br/>${mainTrx.destination || 'KATNI'}</td>
                </tr>
                 <tr>
                    <td class="no-border">Dispatched through<br/>${mainTrx.vehicle_number || '-'}</td>
                     <td class="no-border"></td>
                </tr>
            </table>
        `;

        // Bank Details
        // Bank Details
        const bankDetails = !isPurchase ? `
            <div style="margin-top: 10px; border: 1px solid black; padding: 5px; font-size: 9px;">
                <strong>Bank Details:</strong><br/>
                Bank Name: ${bankData?.bank_name || 'HDFC Bank'}<br/>
                A/C No.: ${bankData?.account_no || '50200012345678'}<br/>
                IFSC Code: ${bankData?.ifsc || 'HDFC0001234'}<br/>
                Holder Name: ${bankData?.holder_name || 'Nagariya Traders'}
            </div>
        ` : '';

        return `
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                    <style>
                        body { font-family: 'Helvetica', sans-serif; font-size: 10px; margin: 0; padding: 10px; }
                        table { width: 100%; border-collapse: collapse; }
                        td, th { border: 1px solid black; padding: 4px; vertical-align: top; }
                        .header { text-align: center; }
                        .title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
                        .company-name { font-size: 14px; font-weight: bold; }
                        .no-border { border: none; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        .bold { font-weight: bold; }
                        .small { font-size: 9px; color: #555; }
                        .amount-words { margin-top: 10px; font-weight: bold; border-top: 1px solid black; padding-top: 5px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">${isPurchase ? 'PURCHASE RECEIPT' : 'TAX INVOICE'}</div>
                    </div>

                    <table>
                        <!-- Header Section -->
                        <tr>
                            <td colspan="4" width="50%">
                                <div class="company-name">M/S NAGARIYA TRADERS MAIN ROAD GANJ PROP MAHESH PRASAD NAGARIYA</div>
                                GANJ<br/>
                                GSTIN/UIN: 23BEKPN1849B1ZQ<br/>
                                State Name: Madhya Pradesh, Code: 23<br/>
                                Contact: 9424785568
                            </td>
                            <td colspan="3" width="50%">
                                ${transportTable}
                            </td>
                        </tr>

                        <!-- Consignee Section -->
                        <tr>
                            <td colspan="4">
                                <strong>Consignee (Ship to)</strong><br/>
                                <b>${isPurchase ? 'Self' : contact.name}</b><br/>
                                GSTIN/UIN: ${isPurchase ? '23BEKPN1849B1ZQ' : (contact.gst_number || 'Unregistered')}<br/>
                                State Name: ${partyState.name}, Code: ${partyState.code}
                            </td>
                            <td colspan="3">
                                <strong>${isPurchase ? 'Supplier (Bill from)' : 'Buyer (Bill to)'}</strong><br/>
                                <b>${contact.name}</b><br/>
                                GSTIN/UIN: ${contact.gst_number || 'Unregistered'}<br/>
                                State Name: ${partyState.name}, Code: ${partyState.code}
                            </td>
                        </tr>

                        <!-- Items Header -->
                        <tr class="text-center bold" style="background-color: #f0f0f0;">
                            <td width="5%">SI No.</td>
                            <td width="35%">Description of Goods</td>
                            <td width="10%">Bags</td>
                            <td width="10%">Bharti</td>
                            <td width="15%">Quantity</td>
                            <td width="10%">Rate</td>
                            <td width="15%">Amount</td>
                        </tr>

                        <!-- Items Body -->
                        ${rowsHtml}
                        
                        <!-- Empty Rows -->
                        <tr style="height: 100px;">
                            <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                        </tr>

                        ${isPurchase && (mainTrx.labour_cost_per_bag > 0) ? `
                        <tr>
                            <td colspan="4" class="text-right bold">Less: Labour / Palledari (@ ₹${mainTrx.labour_cost_per_bag}/bag)</td>
                            <td class="text-right bold"></td>
                            <td></td>
                            <td class="text-right bold text-red">- ${(mainTrx.labour_cost_per_bag * mainTrx.number_of_bags).toFixed(2)}</td>
                        </tr>
                        ` : ''}

                        <!-- Total -->
                        <tr>
                            <td colspan="4" class="text-right bold">Sub Total (Taxable)</td>
                            <td class="text-right bold">${totalQty.toFixed(2)} QTL</td>
                            <td></td>
                            <td class="text-right bold">${taxableAmount.toFixed(2)}</td>
                        </tr>
                        
                        <!-- Tax Rows -->
                        ${taxRows}

                        <!-- Grand Total -->
                        <tr>
                            <td colspan="6" class="text-right bold" style="background-color: #eee;">Grand Total</td>
                            <td class="text-right bold" style="background-color: #eee;">${grandTotal.toFixed(2)}</td>
                        </tr>

                        <!-- Payment History (If any) -->
                         ${paymentRows}

                         <tr>
                            <td colspan="6" class="text-right bold">Total Amount Paid</td>
                            <td class="text-right bold">${(mainTrx.amount_paid || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="6" class="text-right bold">Balance Due</td>
                            <td class="text-right bold text-red">${(grandTotal - (mainTrx.amount_paid || 0)).toFixed(2)}</td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td colspan="7">
                                <div class="amount-words">Item Value: INR ${grandTotal.toFixed(2)} Only<br/>
                                (INR ${numberToWords(grandTotal)} Only)</div>
                                <br/>
                                
                                <table style="width: 100%; border: none;">
                                    <tr>
                                        <td style="border: none; width: 60%; vertical-align: top;">
                                            Tax Amount (in words): ${totalTax > 0 ? totalTax.toFixed(2) : 'NIL'}<br/><br/>
                                            Declaration:<br/>
                                            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                                            ${bankDetails}
                                        </td>
                                        <td style="border: none; border-left: 1px solid black; width: 40%; text-align: right; vertical-align: bottom; padding-left: 10px;">
                                            <div style="height: 80px;"></div>
                                            <strong>for NAGARIYA TRADERS</strong><br/><br/>
                                            Authorised Signatory
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `;
    };

    const generatePdf = async () => {
        try {
            if (Platform.OS === 'web') {
                // On Web, use a manual iframe approach to ensure ONLY the bill HTML is printed
                // This prevents the "whole page printing" issue
                const printFrame = document.createElement('iframe');
                printFrame.style.position = 'absolute';
                printFrame.style.top = '-1000px';
                printFrame.style.left = '-1000px';
                document.body.appendChild(printFrame);

                const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
                frameDoc.open();
                frameDoc.write(htmlContent);
                frameDoc.close();

                // Wait for images/styles to load then print
                setTimeout(() => {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();

                    // Cleanup
                    setTimeout(() => {
                        document.body.removeChild(printFrame);
                    }, 500);
                }, 500);
            } else {
                // On Mobile, generate PDF and share
                const { uri } = await Print.printToFileAsync({ html: htmlContent });

                // Rename file
                const contact = contacts[mainTrx.contact_id] || {};
                const partyName = (contact.name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `${partyName}_${mainTrx.invoice_number || 'INV'}.pdf`;
                const newUri = FileSystem.documentDirectory + fileName;

                await FileSystem.moveAsync({
                    from: uri,
                    to: newUri
                });

                await Sharing.shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Invoice ${fileName}` });
            }
        } catch (error) {
            console.error(error);
            Alert.alert(t('error'), t('failedPDF'));
        }
    };

    // Helper to calc net receivable
    const getNetReceivable = (trx) => {
        if (!trx) return 0;
        const shortageVal = (trx.shortage_quantity || 0) * trx.rate_per_quintal;
        const deduct = trx.deduction_amount || 0;
        return trx.total_amount - shortageVal - deduct;
    };

    const calculateProfit = (trx) => {
        if (!trx) return 0;
        const revenue = getNetReceivable(trx);
        const cost = (trx.quantity_quintal * trx.cost_price_per_quintal);
        return revenue - cost;
    };

    const handleSettle = async () => {
        if (!mainTrx) return;
        setSettlementLoading(true);
        try {
            const sImp = parseFloat(shortageQty) || 0;
            const dImp = parseFloat(deductionAmt) || 0;

            // 1. Update Settlement
            const res = await client.put(`/transactions/${mainTrx.id}`, {
                shortage_quantity: sImp,
                deduction_amount: dImp,
                deduction_note: deductionNote
            });

            // 2. If "Mark Paid" selected, pay the balance
            if (markAsPaid) {
                // Calculate Net Balance using NEW values
                const shortageVal = sImp * mainTrx.rate_per_quintal;
                const netTotal = mainTrx.total_amount - shortageVal - dImp;
                const pending = netTotal - (mainTrx.amount_paid || 0);

                if (pending > 0) {
                    await client.post(`/transactions/${mainTrx.id}/payment`, { amount: pending });
                }
            }

            Alert.alert(t('success'), t('settlementUpdated'));
            setSettlementModalVisible(false);
            setMarkAsPaid(false);
            fetchData();
        } catch (e) {
            console.error(e);
            Alert.alert(t('error'), t('failedToUpdate'));
        } finally {
            setSettlementLoading(false);
        }
    };

    // ...
    const [markAsPaid, setMarkAsPaid] = useState(false);

    const [settlementModalVisible, setSettlementModalVisible] = useState(false);
    const [shortageQty, setShortageQty] = useState('0');
    const [deductionAmt, setDeductionAmt] = useState('0');
    const [deductionNote, setDeductionNote] = useState('');
    const [settlementLoading, setSettlementLoading] = useState(false);

    // Initializer for modal
    const openSettlement = () => {
        if (mainTrx) {
            setShortageQty((mainTrx.shortage_quantity || 0).toString());
            setDeductionAmt((mainTrx.deduction_amount || 0).toString());
            setDeductionNote(mainTrx.deduction_note || '');
            setSettlementModalVisible(true);
        }
    };

    if (loading) return <ActivityIndicator size="large" className="mt-20" />;
    if (!mainTrx) return <View className="flex-1 justify-center items-center"><Text>No Data</Text></View>;

    return (
        <View className="flex-1 bg-gray-50">
            <View className="bg-brand-navy pt-12 pb-4 px-6 shadow-sm z-10 flex-row items-center justify-between">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                        <Text className="text-white text-2xl">←</Text>
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-white">{t('billPreview')}</Text>
                </View>
                <TouchableOpacity onPress={generatePdf} className="bg-brand-gold px-3 py-1 rounded">
                    <Text className="font-bold text-brand-navy">PDF</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1">
                {/* Settlement Card - Sale Only */}
                {mainTrx.type === 'sale' && (
                    <View className="mx-4 mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-lg text-brand-navy">{t('settlementFinal')}</Text>
                            <TouchableOpacity onPress={openSettlement} className="bg-gray-100 px-3 py-1 rounded border border-gray-300">
                                <Text className="text-xs font-bold text-brand-navy">{t('editSettle')}</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row justify-between mb-1">
                            <Text className="text-gray-600">Billed Amount ({totalQty.toFixed(2)} Qtl):</Text>
                            <Text className="font-bold">₹ {totalAmt.toFixed(2)}</Text>
                        </View>

                        {(mainTrx.shortage_quantity > 0 || mainTrx.deduction_amount > 0) && (
                            <>
                                <View className="flex-row justify-between mb-1">
                                    <Text className="text-red-500">(-) Shortage ({mainTrx.shortage_quantity} Qtl):</Text>
                                    <Text className="text-red-500 font-bold">- ₹ {(mainTrx.shortage_quantity * mainTrx.rate_per_quintal).toFixed(2)}</Text>
                                </View>
                                <View className="flex-row justify-between mb-1">
                                    <Text className="text-red-500">(-) Other Deductions:</Text>
                                    <Text className="text-red-500 font-bold">- ₹ {mainTrx.deduction_amount.toFixed(2)}</Text>
                                </View>
                                <View className="h-[1px] bg-gray-200 my-2" />
                            </>
                        )}

                        <View className="flex-row justify-between">
                            <Text className="font-bold text-brand-navy text-lg">Net Receivable:</Text>
                            <Text className="font-bold text-brand-navy text-lg">₹ {getNetReceivable(mainTrx).toFixed(2)}</Text>
                        </View>
                    </View>
                )}

                {/* Profit Display (Private) - Admin Only */}
                {isAdmin && mainTrx?.type === 'sale' && (mainTrx.cost_price_per_quintal > 0) && (
                    <View className="mx-4 mt-4">
                        {!showProfit ? (
                            <TouchableOpacity onPress={() => setShowProfit(true)} className="self-end">
                                <Text className="text-gray-400 text-xs text-right underline">Show Internal Analysis</Text>
                            </TouchableOpacity>
                        ) : (
                            <View className="bg-green-50 border border-green-200 p-4 rounded-xl flex-row justify-between items-center shadow-sm">
                                <View>
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-green-800 font-bold text-lg mr-2">Net Profit</Text>
                                        <TouchableOpacity onPress={() => setShowProfit(false)}>
                                            <Text className="text-gray-400 text-xs">✕ Hide</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <Text className="text-green-600 text-xs">Based on Settlement</Text>
                                </View>
                                <Text className={`font-bold text-2xl ${calculateProfit(mainTrx) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                    ₹ {calculateProfit(mainTrx).toFixed(2)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <View className="bg-white m-4 shadow-lg rounded-none border border-gray-200 h-[500px]">
                    {Platform.OS === 'web' ? (
                        <iframe srcDoc={htmlContent} style={{ width: '100%', height: '100%', border: 'none' }} />
                    ) : (
                        <WebView
                            originWhitelist={['*']}
                            source={{ html: htmlContent }}
                            style={{ flex: 1 }}
                        />
                    )}
                </View>

                <TouchableOpacity
                    className="bg-brand-navy mx-4 mb-6 p-4 rounded-xl items-center shadow-lg active:bg-blue-900"
                    onPress={generatePdf}
                >
                    <Text className="text-white font-bold text-lg">📄 {t('downloadPrintPdf')}</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Settlement Modal */}
            <Modal visible={settlementModalVisible} transparent animationType="slide" onRequestClose={() => setSettlementModalVisible(false)}>
                <View className="flex-1 justify-center items-center bg-black/50 px-4">
                    <View className="bg-white w-full rounded-2xl p-6">
                        <Text className="text-xl font-bold text-brand-navy mb-4">{t('updateSettlement')}</Text>

                        <Text className="mb-1 font-bold text-gray-700">{t('shortageQty')} (Qtl)</Text>
                        <TextInput
                            className="border border-gray-300 rounded-lg p-3 mb-4 bg-gray-50 text-lg"
                            keyboardType="numeric"
                            value={shortageQty}
                            onChangeText={setShortageQty}
                            placeholder="0.00"
                        />

                        <Text className="mb-1 font-bold text-gray-700">{t('deductionAmount')} (₹)</Text>
                        <TextInput
                            className="border border-gray-300 rounded-lg p-3 mb-4 bg-gray-50 text-lg"
                            keyboardType="numeric"
                            value={deductionAmt}
                            onChangeText={setDeductionAmt}
                            placeholder="0.00"
                        />

                        <Text className="mb-1 font-bold text-gray-700">{t('noteReason')}</Text>
                        <TextInput
                            className="border border-gray-300 rounded-lg p-3 mb-6 bg-gray-50 text-lg"
                            value={deductionNote}
                            onChangeText={setDeductionNote}
                            placeholder="e.g. Quality Cut"
                        />

                        <TouchableOpacity
                            className="flex-row items-center mb-6"
                            onPress={() => setMarkAsPaid(!markAsPaid)}
                        >
                            <View className={`w-6 h-6 rounded border ${markAsPaid ? 'bg-brand-navy border-brand-navy' : 'border-gray-400'} mr-3 justify-center items-center`}>
                                {markAsPaid && <Text className="text-white font-bold">✓</Text>}
                            </View>
                            <Text className="text-gray-700 font-bold">{t('closeBill')}</Text>
                        </TouchableOpacity>

                        <View className="flex-row justify-end space-x-4">
                            <TouchableOpacity onPress={() => setSettlementModalVisible(false)} className="p-3">
                                <Text className="font-bold text-gray-500">{t('cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSettle}
                                className="bg-brand-gold px-6 py-3 rounded-xl"
                                disabled={settlementLoading}
                            >
                                {settlementLoading ? <ActivityIndicator color="#1e1b4b" /> : <Text className="font-bold text-brand-navy">{t('updateSettlement')}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default BillViewScreen;
