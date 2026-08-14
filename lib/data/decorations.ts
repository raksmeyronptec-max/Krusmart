export type MaterialSize = { name: string; desc: string; file: string; icon: string; };
export type DecorationMaterial = { id: number; title: string; category: string; size: string; preview: string; sizes: MaterialSize[]; };

export const materialsData: DecorationMaterial[] = [
    // ==========================================
    // ផ្នែកទី១៖ អក្សរសាស្ត្រ និង ភាសា
    // ==========================================
    {
        id: 1,
        title: "ប័ណ្ណរូប ព្យញ្ជនៈ ក ខ",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "2.4 MB & 7 MB",
        preview: "previews/កខគ/1.png",
        sizes: [
            { name: "PowerPoint", desc: "ស័ក្តិសមសម្រាប់យកទៅកែបន្ថែម", file: "https://docs.google.com/presentation/d/1czeWtwfRide0yaJnnUi13f5vDq1vXVer/edit?usp=sharing&ouid=108233550721288763250&rtpof=true&sd=true", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zQNBU5o0hE_nKwL2HzGQpkG796_UiW8i/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 2,
        title: "អក្ខរក្រមអង់គ្លេស (Alphabet)",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "5.6 MB",
        preview: "previews/abc/abc.png",
         sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1qi_BEFGVALfesTGyom9qO98lLtihLc-F/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1wSx018q4e4eAhBy0kwgziy_nt5MqjTLu/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ស័ក្តិសមសម្រាប់ចែកសិស្សម្នាក់ៗ", file: "https://drive.google.com/file/d/1HBVpVKgw_6GeA9Dttqir-6eVKj0qPBBk/view?usp=sharing", icon: "file" }
        ]
    },
    {
        id: 3,
        title: "បទកាកគតិ", 
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "9.3 MB",
        preview: "previews/បទកាកគតិ/1.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1ShcOfKzeDif7YXRAbEFFF_YS58ccB7Zj/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1IA0lTUb-EZnW2iz9rRfnrTACIYIG_UJe/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1rXwTYGdevg-Lmt-r1YBO-4Rs0X3wgiHj/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 4,
        title: "បទពាក្យប្រាំពីរ", 
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "9.3 MB",
        preview: "previews/បទពាក្យប្រាំពីរ/1.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1BNQZiVYC4Irv8c6qxTlQnzcWMh0gDMvr/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/17-ueg3grHJB1r9v-QqruXeKMy-Q-kznn/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zIyPYhV-mFlpz_twaMdcg6fWT98REPVL/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 5,
        title: "ព្យញ្ជនៈ រូបភាព និងពាក្យ",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "51 MB",
        preview: "https://lh3.googleusercontent.com/d/1zku3dJR1AsVpFXKX2xAI0jhis8RSpJAF",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1TGkXrhxIfy41S7Ipbt3SZ8-6Q0YFhXkP/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 6,
        title: "ព្យញ្ជនៈ ស៊ុមកាត់",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "56,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1OoaIncEVBAvLDnrFp-BoWgENjMin_Qj3",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1mEkAP0eOBD-fJzH42p5ozmC5YlzqDbZQ/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 7,
        title: "សញ្ញាត្រីស័ព្ទ ឬសញ្ញាសក់ក_៊",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "11,7 MB",
        preview: "https://lh3.googleusercontent.com/d/1buoSn-_upWgMxawkV5unkm6kjyt7rZxw",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1tmLTD7NCD-RGs3t2dA7uZb11AieCsAoU/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 8,
        title: "សញ្ញាមូសិកទន្ត ឬ ធ្មេញកណ្ដុរ_៉",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "14 MB",
        preview: "https://lh3.googleusercontent.com/d/1voAuB2b7KpawMsfkXOGvg_c-gsdkrYsi",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1ZGBcxBHO5DlzGs-L3Tb427Mgadw9M9j5/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 9,
        title: "សញ្ញាមូសិកទន្ត ឬ ធ្មេញកណ្ដុរ_៉",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "404 KB",
        preview: "https://lh3.googleusercontent.com/d/1gD_LetP-PanBR_u6OeZxPpquo_SLNP0m",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Zt5-tVXyon6RIjFCA4Bv7n5NFYGtMLLA/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 10,
        title: "ស្រៈ ស៊ុមកាត់",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "36,9 MB",
        preview: "https://lh3.googleusercontent.com/d/1qNmfFxGW6_u29BNdEOdIxKVx8vxC7HuS",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1QTci5NnkX58HZGTe9xsMwHP7FYdt6H09/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 11,
        title: "ស្រៈដើមផ្កា",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "52,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1xA0MrFeeuH_x850z5E56JnihRJWy9I3Q",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1UUJX9yV4nL9WR9QF409aD7hfBGhJ60Rn/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 12,
        title: "ស្រៈពេញតួ",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "68,9 MB",
        preview: "https://lh3.googleusercontent.com/d/1Ao-j50BceZ2SREOrxJufL1mIxQWeFoA-",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/186XjuJCpC_pkQ_lb_ibvnmW-Z5mt1aDz/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 13,
        title: "ស្រះនិស្ស័យ ពួក អ និង អ៊",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "9,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1F8xFo6gT7aZJtNKhq7b7D5zvSC3lk_xX",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1H0h3FlrFiTfyVpQe98g6JTQeUq34_2sk/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 14,
        title: "កំណាព្យឆ្នាំខ្មែរទាំង១២ (Poems for 12 zodiac animal)",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "7,2 and 16 MB",
        preview: "https://lh3.googleusercontent.com/d/1G1VT2H7Q_YRENYaSwkrdG3iZ0wl5uqyV",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1NSmFQHOmMiIL0gjKFzbIcchtHok_RAJf/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1HC6UybbGHfbhJh5Q4MDD1dupwnqmUNoL/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1kCjj4hQYrcd08dsk4RqjInm_h58u0sns/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 15,
        title: "បែន័រជើងក្រោម ព្យព្ជនៈ (Wallpaper for bottom consonan)",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "15,9 MB",
        preview: "https://lh3.googleusercontent.com/d/1ezVDcXagF7yfGZcH3x1GE30zRsrAgaLr",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1kb-C276fPWnyH29Y2pZ6P58SrfXn5ZWQ/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 16,
        title: "បែន័រជើងក្រោម ស្រៈ (Wallpaper for bottom vowels)",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "1,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1Iio2s7tc0FX62H9s-KXGQd2E-LTE92QU",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1TgomxrZLsPq0DEy_RlTsLM8k3Obswh1E/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 17,
        title: "បែន័រជើងក្រោម ស្រៈ (Wallpaper for bottom vowels)",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "1,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1BPX_jmV4BKXoNLlUMEe7L8T3RFdYQo2F",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Fixul2eujGE-5Yp4hDgupqKW93OfQyyG/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 18,
        title: "ផ្ទៃលំហ ព្យញ្ជនៈ ខាងមុខ Hanging decoration consonants",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "2,9 MB",
        preview: "https://lh3.googleusercontent.com/d/1qLMcwLB713U3Pcg-hjtIdHBH32Lyv0qG",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Uvv9qGZDzbBv-Z9mehlF_090DHXRqkoL/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 19,
        title: "ផ្ទៃលំហ ស្រៈ ខាងមុខ Hanging decoration Vowels",
        category: "អក្សរសាស្ត្រ និងភាសា",
        size: "1,7 MB",
        preview: "https://lh3.googleusercontent.com/d/1BUI2qh3_RTIWaYJHsy7HmQsHbSAwyYe4",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1BUI2qh3_RTIWaYJHsy7HmQsHbSAwyYe4/view?usp=sharing", icon: "file-text" }
        ]
    },

    // ==========================================
    // ផ្នែកទី២៖ គណិតវិទ្យា និង រូបធរណីមាត្រ
    // ==========================================
    {
        id: 20,
        title: "មេគុណលេខ ១ ដល់ ៩ លេខខ្មែរ",
        category: "គណិតវិទ្យា",
        size: "1.5 MB",
        preview: "previews/primary_number_2->9.pdf/Khmer.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1_P8fT-3Mib-nZ2OuULWmdLV0kzsaorAN/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 21,
        title: "មេគុណលេខ ១ ដល់ ៩ លេខអារ៉ាប់",
        category: "គណិតវិទ្យា",
        size: "1.5 MB",
        preview: "previews/primary_number_2->9.pdf/en.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1cCRBiMgC1FoOqCTsRL45cZABVWsSlm09/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 22,
        title: "ចំនួន១០ ដល់ ១០០",
        category: "គណិតវិទ្យា",
        size: "20,2 MB", 
        preview: "https://lh3.googleusercontent.com/d/1kJUnquYKc6ki94rvPjxu8ljCJBlBpxpq",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1ZzFDNZWCvz2wXH304bhnL860OEijmCwo/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 23,
        title: "ចំនួនឪឡឹក ១ ដល់ ១០",
        category: "គណិតវិទ្យា",
        size: "9,8 MB",
        preview: "https://lh3.googleusercontent.com/d/1eLchZQehhWPkbQn2ff1I4EBZQDI7nzD9",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1h2P9FSXSBDlLrajsDCOncTFRdeNfeTNT/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 24,
        title: "រង្វាស់រង្ចាល់",
        category: "គណិតវិទ្យា",
        size: "2,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1ckrM2kxYWwb4wwiGDj3tcxgImpyk9Q3U",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1eWWqTcGrGyczNe7SWH4uh3ibD18z4oSo/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 25,
        title: "ប្រភេទត្រីកោណ ១",
        category: "គណិតវិទ្យា",
        size: "1.6 MB & 1 MB",
        preview: "previews/types_of_triangle/There_are_four_types_of_triangles;_Scalene,_Right,_Acute,_and_Isosceles.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1UOuQIrJqYJ1Q9u0kVHagilxSmF6fgYgW/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1gumLDqYXmNRCW2NZFVt1xKQS9P-ILK8r/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1KGYiQC5TC0UhiE53KwP1n_2uEmvv28so/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 26,
        title: "ប្រភេទត្រីកោណ ២",
        category: "គណិតវិទ្យា",
        size: "36.7 MB",
        preview: "previews/types_of_triangle/types3.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1b7_GPFQYeGVOhk1jZ8upwnWmuWSo6cFD/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1SLYIfMsHQTm198fkonkhMdZ1pSJ_ByME/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Dy6awhkEfHrvWgQSCGKQo4HSr3VaDOz5/view?usp=sharing", icon: "file-text" }
        ]
    },
     {
        id: 27,
        title: "រូបធរណីមាត្រ ការេ ចតុកោណ ត្រីកោណ និងរង្វង់",
        category: "គណិតវិទ្យា",
        size: "166 KB & 400 KB",
        preview: "previews/types_of_triangle/types2.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1ph5D-lcqgPYIcpGkPj881-YglrSjTjFD/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1X4jrfNHPV07AhwHdS-rBna_Zt5O1T4YQ/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/18oFIxdlJzATfQNpZvqi7C412vdG3NmLn/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 28,
        title: "រូបធរណីមាត្រ Poster shape",
        category: "គណិតវិទ្យា",
        size: "14,1 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/17OTVLSxMMIzZs5fxgBDK6qQfk7Q_vL_V",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1DgAn_QeaNiLTGuxqtuExDX8AQm47s3Jx/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1Nu9YU8PoskjlxbfI3S-UqGuwLxaaMkpK/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1a3J7MVr-iGr6AtwMGn5fpQLyJtzsTv0x/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 29,
        title: "លំនាំគំនូសមូលដ្ធាន Basic pattern",
        category: "គណិតវិទ្យា",
        size: "1,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1-9q3WSD-OADxRLI9oeGOT7ce3799fuS5",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1W3SQAccum2Hw4eIyPo3bMaoPn81ZI4lr/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1ani42Ank9Xg6swDS2FaDZ2kTayCaQY9D/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1qk0XZt9nE_aPqe_HcK2weNMNzHlUY-7t/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 30,
        title: "លំនាំគំនូសមូលដ្ធាន Basic pattern",
        category: "គណិតវិទ្យា",
        size: "1,0 MB",
        preview: "https://lh3.googleusercontent.com/d/1s_tXVWBrukYPK3tlbLyq6urL7-vZlr4b",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/15Mc2utbbhi_2_9QhySQa1Mip_GURuNL4/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 31,
        title: "បែន័រជើងក្រោម លេខ Wallpaper for bottom numbers",
        category: "គណិតវិទ្យា",
        size: "1,6 MB",
        preview: "https://lh3.googleusercontent.com/d/1BPX_jmV4BKXoNLlUMEe7L8T3RFdYQo2F",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Fixul2eujGE-5Yp4hDgupqKW93OfQyyG/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 32,
        title: "ផ្ទៃលំហ លេខ ខាងមុខ Hanging decoration Numbers",
        category: "គណិតវិទ្យា",
        size: "2,5 MB",
        preview: "https://lh3.googleusercontent.com/d/1ky313TaL-mFTVb_2Fx-n8S7x7icRtEa4",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1PMZ-nwCtzy10K4XXrjBkk2crK9NctagX/view?usp=sharing", icon: "file-text" }
        ]
    },

    // ==========================================
    // ផ្នែកទី៣៖ ពេលវេលា ថ្ងៃ ខែ ឆ្នាំ
    // ==========================================
    {
        id: 33,
        title: "ឆ្នាំទាំង១២",
        category: "ពេលវេលា",
        size: "8.0 MB",
        preview: "previews/years12/years12.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1aCSeFjOMvMrmy-BCFqiOUOSZFwF_AFnQ/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 34,
        title: "ឆ្នាំទាំង១២",
        category: "ពេលវេលា",
        size: "17,6 MB",
        preview: "https://lh3.googleusercontent.com/d/1HjCiMPv5pWrLsRqwtEZL-uZAKj6zK7D9",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/12ufsM1tX4QkzJ4mTuCryQuXJDdEXtnMH/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 35,
        title: "ខែសកល ១",
        category: "ពេលវេលា",
        size: "33.5 MB",
        preview: "previews/monthly/1.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "pdfs/mothly/monthly_of_khmer.pdf", icon: "file-text" }
        ]
    },
    {
        id: 36,
        title: "ខែសកល ២",
        category: "ពេលវេលា",
        size: "33.5 MB",
        preview: "previews/monthly/monthly_of_khmer4.jpg",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1tYMBhliArrgVazceunWSuRYlFGZ-ZRjG/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1_xRdgWoQmcPYZONa7UpXMCrOXtg2VTI8/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1trTbnc2G9wuKrgWIEPfsfPn-puCmPPA8/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 37,
        title: "ខែខ្មែរ ១",
        category: "ពេលវេលា",
        size: "49.7 MB",
        preview: "previews/monthly/3.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1uVIDzwke4euWeKShKMTZh5Z1KbnTKkr0/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 38,
        title: "ខែខ្មែរ ២",
        category: "ពេលវេលា",
        size: "9.3 MB",
        preview: "previews/monthly/monthly_of_khmer1.jpg",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1saBYDESSTDElEW5q4RagkfI99ZEcok3v/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/11_HT7X7Yk5fNZ8LORvaY7FL2SLRi_L79/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1wpAa3A79_ArkJv26yuyE7LpdGPuniCQi/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 39,
        title: "សម្លៀកបំពាក់ទាំង៧ថ្ងៃ",
        category: "ពេលវេលា",
        size: "1.153 MB",
        preview: "previews/7_day_of_cloths/7_day.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1wj5K0-KNm8wpcj9RGTO0MR9rjvqbxWeL/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 40,
        title: "ថ្ងៃនៃសប្តាហ៍",
        category: "ពេលវេលា",
        size: "9,6 MB",
        preview: "https://lh3.googleusercontent.com/d/1XWDfZkb9Qc05ymWEQvmusQOqKedPSfmy",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1igWv03pAtiMmMqzHpqF8itNE9dOPFTiF/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 41,
        title: "ពេលវេលា",
        category: "ពេលវេលា",
        size: "1,4 MB",
        preview: "https://lh3.googleusercontent.com/d/1OwiFudlbQMfCBGhah9po_eWnfjkGzf22",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1k7wlCQafbzw68JJqzLTMCYcrsXiASOe8/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 42,
        title: " បន្ទះថ្ងៃក្នុងមួយសប្ដាហ៍ (Day panel of the week)",
        category: "ពេលវេលា",
        size: "4,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1KAKyUcHd5U2r7A56JpqK5ARjOHgcOCcw",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1CSxsLtcMRPFBlm3kdT7GOjqGmMmJK0DB/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 43,
        title: " បន្ទះលេខ ១ ដល់ ៣១ (Date panels 1 to 31)",
        category: "ពេលវេលា",
        size: "4,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1sLk-Lykgl2iFYZj5aRSzzGyi6vjF3P8E",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1pnPbSr8VcZnv_29vhth0lm_vZJNtFRXa/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 44,
        title: " បន្ទះលេខ ១ ដល់ ៣១ (Date panels 1 to 31) V2",
        category: "ពេលវេលា",
        size: "4,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1sOQy7t7YFIWaTkemNZGmxQZQ7a-9WmXh",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1FWg8nkMqXXdBhPRL7hMDEhB8bbLjcpge/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 45,
        title: " តារាងប្រតិទិន ប្រចាំខែ (Monthly calendar)",
        category: "ពេលវេលា",
        size: "3,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1Muq4xaiOMPkNjgeGVgmuhJxaBpTvrdMv",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1vvtcGPPwPUtI_R2BXtg-JLCULchyba72/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 46,
        title: " បន្ទះថាសថ្ងៃក្នុងសប្តាហ៍ (Day disk of the week)",
        category: "ពេលវេលា",
        size: "0,5 MB",
        preview: "https://lh3.googleusercontent.com/d/1WkvUoR4KEISSMN8CxPIUwda4_0vtiMtU",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1XbaYzOIiqoKLGpq2GAgJrlPCv_ri6Agk/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1CJ-pcMvzqj1cRF6TW-xEWBJsio_TxJrD/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1A6nzAiIiDriHlCF8pEKKS3-JF23OA7Nf/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 47,
        title: "កាតកាលបរិច្ឆេទ Date Cards",
        category: "ពេលវេលា",
        size: "1,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1sfMyCAt7nl9IqhJ7ltNRefsIaGJqCpxI",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1ltHXXrabayg9UxW1-QX00rh15RkpUxzH/view?usp=sharing", icon: "file-text" }
        ]
    }, 

    // ==========================================
    // ផ្នែកទី៤៖ វិទ្យាសាស្ត្រ ផែនដី និងរាងកាយ
    // ==========================================
    {
        id: 48,
        title: "ភពទាំង៨",
        category: "វិទ្យាសាស្ត្រ",
        size: "211 KB",
        preview: "previews/planet/planet.png",
        sizes: [
            { name: "ទំហំ A4", desc: "ឯកសារទំហំ A4", file: "https://drive.google.com/file/d/1RiT9sB7-PinFifz7rSXwd3CU6Nno5Qc8/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 49,
        title: "រុក្ខជាតិ ផ្លែ ស្លឹក មើម",
        category: "វិទ្យាសាស្ត្រ",
        size: "211 KB",
        preview: "previews/Plants/plant.png",
        sizes: [
            { name: "ទំហំ A4", desc: "ឯកសារទំហំ A4", file: "https://drive.google.com/file/d/1oTVS7Y891t1SHa3LyrrVhaIxQizGGee2/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 50,
        title: "រូបផ្គុំគ្រោងឆ្អឹង",
        category: "វិទ្យាសាស្ត្រ",
        size: "0.9 MB & 0.7 MB",
        preview: "previews/Skeleton_puzzle/Skeleton_puzzle.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1X-W1lDPZf0lKbZRGAX_-YlOQPpIbepsD/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1UtVobAVEt0U7xSBhAukGw-KtNJeZuXbW/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zzka7AqdjNxSYg0aeMS81eLfULo4D4P8/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 51,
        title: " រាងកាយកុមារ (Body-Parts)",
        category: "វិទ្យាសាស្ត្រ",
        size: "4,5 MB",
        preview: "https://lh3.googleusercontent.com/d/1NH0uPkuTfAyk9yzsp3wPkUOgwWBiVbcC",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1aiuvjxljPWsVzES10vU0X60_nU0I30xZ/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1ahixuJLj9zD9g6TLI7JPC76fLRL0anE9/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1dctOoofv-mxVfdopJV24eqPI9qVf4GVW/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 52,
        title: "វិញ្ញាណទាំង ៥ របស់ខ្ញុំ",
        category: "វិទ្យាសាស្ត្រ",
        size: "380 KB",
        preview: "previews/វិញ្ញាណទាំង៥របស់ខ្ញុំ/1.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1u8TD02gRRm_AoRgOvIQkb5wewP2h4LY5/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1H--YAjCMx0avWjHpzdEGw7JCHarAEyAE/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1PrUZ2G8wZwHQZZKDIa53IegYnnWcfVM9/view?usp=sharing", icon: "file-text" }   
        ]
    },
    {
        id: 53,
        title: "វិញ្ញាណទាំងប្រាំរបស់ខ្ញុំ",
        category: "វិទ្យាសាស្ត្រ",
        size: "448 KB",
        preview: "https://lh3.googleusercontent.com/d/1uA6I1PckciXACPycojyxRoxzZ0qNxuvi",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1MTJOvkHBNf1ACxCtEACFzRQx_Ang6N2h/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1S-oejA82tTKtp2Zf6KwXOemqgbhieo28/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1mFLumJq6iEs05WysuVPnp23Ot7ChU4Q9/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 54,
        title: "ទិសទាំង៨ ជាអក្សរ",
        category: "វិទ្យាសាស្ត្រ",
        size: "43.8 MB",
        preview: "previews/8_direction/text.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1iVb_HmtJcoIzh_UWpKzipsQ5QZfQYHoh/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 55,
        title: "ទិសទាំង៨",
        category: "វិទ្យាសាស្ត្រ",
        size: "389 KB & 4.9 MB",
        preview: "previews/8_direction/8_directions.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1KQm6pnD7oo8ih2lCeiDDWhRkcDxwcOyg/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1_1EOcJj34wPP3lbYA_4Yiaijh1TXXmfe/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1dUIh8nvXNPrHGbhDF-kEo-wRTYe32Sj7/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 56,
        title: "រូបផ្គុំ វិទ្យាសាស្ត្រ",
        category: "វិទ្យាសាស្ត្រ",
        size: "3,9 MB",
        preview: "https://lh3.googleusercontent.com/d/1PcH5XMYVZI9UaNPzUNjLhXtG77dy4731",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zOhhQ8pmfn3uzkPk_g0_4DbzRQuVflnW/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 57,
        title: "វដ្តជីវិតសត្វមេអំបៅ (Life cycle of a butterfly)",
        category: "វិទ្យាសាស្ត្រ",
        size: "8,7 MB",
        preview: "https://lh3.googleusercontent.com/d/1sVTQK4eOA5hXRYYoMS6GTA3_PSOOIDNZ",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1k3hwBYsDUbLbvM1969h71jyiUCMHuB0z/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1y_wVs_UGT0oH5reJyziW_x7HST7RKtoZ/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1l2N1LaY263jHOGFrHQaZJKtNsVoJn42F/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 58,
        title: "វដ្តជីវិតសត្វកង្កែប (Life cycle of a frog)",
        category: "វិទ្យាសាស្ត្រ",
        size: "0,5 or 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1X8V2JSXYhWcKQzL9PMZY-qIay35mpDAX",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/13aqIV2_laNk35CpYBnE639HcLoVDs8PY/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1U7K0eZrOQlop91yg9Jt_3NRqV32wKVR4/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/14PHVSGuUvIJJbgXfyO16FpCkDls879sG/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 59,
        title: "វដ្តជីវិតសត្វត្រី (Life cycle of a fish)",
        category: "វិទ្យាសាស្ត្រ",
        size: "0,5 or 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1qpf4fE3eB32-WIljo1fwP8Vx9Sye_spx",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/18_idVzQW4x3xtmV4qs1rOcl-ncs2uc1u/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1jzhJsk_CX1xzm7zsyPH1h9TkD7o5BuBG/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/16p2EDIzXzVeHemqQ4hUf4ETUgVVZWF_g/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 60,
        title: " វដ្តជីវិតសត្វមាន់ (Life cycle of a chicken)",
        category: "វិទ្យាសាស្ត្រ",
        size: "0,5 or 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1dleNrQ8NSRo--nzACyLGNNswMlN08vSW",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1E9MTRsxeEzvzWwK7Kgw7L5L99uSgAfNR/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1Y_KA61FdiWU5aOk71DDUSV3kydROmqq-/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1CXd22q64IKBvHtKpC1OMoZNftiBRFKBU/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 61,
        title: " វដ្តជីវិតសណ្តែក (Life cycle of a bean)",
        category: "វិទ្យាសាស្ត្រ",
        size: "0,5 or 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1x83ma2M8mOUPgGcYk4YqDnhlsfKbLq7E",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1Kjifi820zMWxEERtWepIrrJgtXO7-1GD/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1usDFiBigSsg1JDdpkA73VLdqiISTmiDg/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/17AYxMqyCTSAEn_nA-LqgP2VYKL9uCZRe/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 62,
        title: " វដ្តជីវិតរបស់មនុស្ស (Life cycle of a human)",
        category: "វិទ្យាសាស្ត្រ",
        size: "0,5 or 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1vEquIHdmBNSUPu8lZlar1UL-tEix5q0C",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1tRWH_gm1EEVm6c5C1JUiebi_RLL9Gt02/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1bCDVL8FCIyIrffLR7RPX781WwUAacCnV/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1RV7o1aCHZsur3xQedNeKGY4TGgUYnCU0/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 63,
        title: "ក្រុមបន្លែ Poster Vegetable",
        category: "វិទ្យាសាស្ត្រ",
        size: "1,8 MB",
        preview: "https://lh3.googleusercontent.com/d/1S7tLX7YgIFFyndxpAgPGBe6U0aSKpV-H",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1uTrcvupSSIY4tH-ss9jEZDaIxJwo5pFC/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1EgVWto2BaEMFi8K_m3fbIYU34ItLV8F2/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1sz4Jt2DD_lMcVIW7NAnTkxEvxtixMVTG/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 64,
        title: "ក្រុមផ្លែឈើ Poster fruits",
        category: "វិទ្យាសាស្ត្រ",
        size: "15,5 MB",
        preview: "https://lh3.googleusercontent.com/d/12onupiG5mtEi1442J7Qq5PZDJVDxSKrk",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1ZSInQGV6-o5XmHuv1RWcZeJGFyACKdYe/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1VqtSUrHYTgpHO-zCcKaaB2Pfwl_mhk-p/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1k8wDazFr7AOnQR4EKWdCTNAwYY58YmgQ/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 65,
        title: "អាហារបីក្រុម Poster food groups",
        category: "វិទ្យាសាស្ត្រ",
        size: "15,5 MB",
        preview: "https://lh3.googleusercontent.com/d/1SB9YSdycs_Pjb7Belw7Nqghan2Fl_Zo6",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1JF3e1KSJy95M6GfjyYMoHZI7Bl1wTA_K/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1I9htcni4-1SwaJCR3sL0sIRlXFKEQRb_/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1T37qy_G0Dh65xnGL6Dy9uZdRWQ5pmDqf/view?usp=sharing", icon: "file-text" }
        ]
    }, 

    // ==========================================
    // ផ្នែកទី៥៖ សីលធម៌ សង្គម និងការគោរព
    // ==========================================
    {
        id: 66,
        title: "របៀបសំពះទាំង៥",
        category: "សីលធម៌ និងសង្គម",
        size: "4.6 MB",
        preview: "previews/salute/salute.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1OI1GPfg29B5zZwWT-SJonIq9Rh2ZCMVq/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 67,
        title: "របៀបសំពះខ្មែរទាំង៥ (២)",
        category: "សីលធម៌ និងសង្គម",
        size: "324 KB",
        preview: "previews/Khmer_Greeting/Khmer_Greeting.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1BzXBsqWAjLkobERJBCp0AzI-wSI6ZLHU/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/114idhWG-taFcNzbS5LD7pSGyuAqy4ygc/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1_4_cgQ2lbwbGmHsPGGmLEdlen2456w_3/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 68,
        title: "របៀបសំពះខ្មែរទាំង៥ (៣)",
        category: "សីលធម៌ និងសង្គម",
        size: "324 KB",
        preview: "previews/Khmer_Greeting/Khmer_Greeting2.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1nfXkoIBeghoaWWbfgS8TxzjkdUv5RfM7/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1wSgi6z0fCr239MKxnvvBZdtnQKm8zD9c/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1vRi6ZiHXjporxCwrR1k-Dake587GIaMV/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 69,
        title: "របៀបសំពះខ្មែរទាំង៥ (៤)",
        category: "សីលធម៌ និងសង្គម",
        size: "324 KB",
        preview: "previews/Khmer_Greeting/Khmer_Greeting3.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1j2s1uDoGzUjXr403-TT_ZecDIMmMlJvY/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1fGBT56kyxGMWfWSUU7P0KfwjO3UKktXS/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zhtVl4aVZ_y1wYwGYSSN4QTHp09MWols/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 70,
        title: "របៀបសំពះប្រពៃណីខ្មែរទាំង៥",
        category: "សីលធម៌ និងសង្គម",
        size: "1,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1vZrQhF6NwsHx7IiG_T8OBRVFHtmvCkSr",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1YYhWd036zGlKgPL0ZHQIl5xP-e7xjGGE/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1opEUb9W7k47dS314b1PHZBMhpbT2d5P4/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Cfqb6wSjzbaFb1AYruG0rQhKPq6T15P4/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 71,
        title: "ចតុស្តម្ភនៃការអប់រំ",
        category: "សីលធម៌ និងសង្គម",
        size: "2.1 MB & 1.7 MB",
        preview: "previews/14_Pillars_of_education/pfe.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1tK7KShZKlhx6ELZv19mGe4H-h3IjDnqX/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1O1nahdNrjtO1aXnGkG23iayshDBA-YsD/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1b-k2iPep0Xkrj1k_83lWw89Dy33zqnJR/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 72,
        title: "ចតុស្ដម្ភអប់រំ និង ព្រហ្មវិហារធម៌ទាំងបួន",
        category: "សីលធម៌ និងសង្គម",
        size: "324 KB",
        preview: "previews/14_Pillars_of_education/pfe2.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1bYAcIduGh3KbsLmFwCJrxsxGUI_3_ycK/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1FM13fahxzrWxa74KhlyjHsKHQYUWVSu9/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1weYZkRpZcWne9PvAYrAww3nJr6quJlaD/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 73,
        title: "សិទ្ធិកុមារ១",
        category: "សីលធម៌ និងសង្គម",
        size: "1.45 MB & 4.6 MB",
        preview: "previews/chlidren's_right/children's_right.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1Qd5gGwDQpGaIHsFkF6ekSM5GJuOuHF4k/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1KN3QC1-mPR-I__r2k791H95dHIHb0peV/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/10TgCDr_8PGVSfoHuTzF_B8RSDHuZe_5y/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 74,
        title: "សិទ្ធិកុមារ២",
        category: "សីលធម៌ និងសង្គម",
        size: "912 KB & 600 KB",
        preview: "previews/chlidren's_right/children's_right2.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1B6Fvaj6sMmyGiZ6LMbgSumcBKQstLafq/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1StIieaSkTDe7mnNl4MMgW0AseBXPXxCY/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/146aIeYXFuAPhuguabVfXZvNAPw82ccsa/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 75,
        title: "គ្រួសារខ្ញុំ (my family)",
        category: "សីលធម៌ និងសង្គម",
        size: "1,3 MB",  
        preview: "https://lh3.googleusercontent.com/d/1xU8--FybJ6KW6ws95SPASHOR3zy39U17",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1rdC47klGID901l4We6rIM9al8nDxkVMu/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1P2Fetfgi2GqmWNEYCjkLjzcf_SRp-Sri/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1xY7hpcDRUb8niC_83OD4KrqBOcngQiK_/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 76,
        title: "មនុស្សសកលទាំង៥",
        category: "សីលធម៌ និងសង្គម",
        size: "7,2 MB",
        preview: "https://lh3.googleusercontent.com/d/13V2qD2tABdCuJJv2qfV3qaKZFWC6VTKM",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1RuRZ9eDZJYukxf0Z29oA4bhofzlGqTSF/view?usp=sharing", icon: "file-text" }
        ]
    },

    // ==========================================
    // ផ្នែកទី៦៖ ចរាចរណ៍
    // ==========================================
    {
        id: 77,
        title: "ភ្លើងសញ្ញាចរាចរណ៍",
        category: "ចរាចរណ៍",
        size: "100-400 KB",
        preview: "previews/traffic/traffic.png", 
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1iUafIEY-KkXaijZ2F0y3ofVwA5Mh1xSC/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1M8HjWrNimHz7nQp9jmw_Px-BlW9eQuAy/view?usp=sharing", icon: "layout" },
            { name: "ទំហំ A3", desc: "ស័ក្តិសមសម្រាប់ចែកសិស្សម្នាក់ៗ", file: "https://drive.google.com/file/d/1CqsvLyvIxARCmQl8-wHEvMZrCNnz0ifp/view?usp=sharing", icon: "file" }
        ]
    },
    {
        id: 78,
        title: "ភ្លើងសញ្ញាចរាចរណ៍ទាំង៣",
        category: "ចរាចរណ៍",
        size: "379 KB",
        preview: "previews/traffic/traffic_2.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Evw9olzsdz3YYwvCf5ch_Wk3giFQ_BLF/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 79,
        title: "អត្តន័យស្លាកសញ្ញាចរាចរ", 
        category: "ចរាចរណ៍",
        size: "2.4 MB & 7 MB",
        preview: "previews/អត្តន័យស្លាកសញ្ញាចរាចរ/1.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1zJcr8QQpPog5LuSgyeo2lxEy-xTagFYR/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1lUfPfKP5e_eM5c47AcVb1jhr1kSTFwmT/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1O_60I5QKGavMdB_OPSUcfKOaTfgRI1Pe/view?usp=sharing", icon: "file-text" }   
        ]
    },
    {
        id: 80,
        title: "ភ្លើងសញ្ញាចរាចរណ៍",
        category: "ចរាចរណ៍",
        size: "1,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1N5Bp_WfKAtc9P-ms9vFANr0S8Us_NTBH",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1tPDgU4lPWld6KhAyuPdgtca8eb5BJGs1/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 81,
        title: "សញ្ញាចរាចរណ៍",
        category: "ចរាចរណ៍",
        size: "268 KB",
        preview: "https://lh3.googleusercontent.com/d/1LSeYTItriG9MmA9Au5JMsVZx_X7AiTNP",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1x0GzNx13YThrWlppSxpifYSPMjf699v1/view?usp=sharing", icon: "file-text" }
        ]
    },

    // ==========================================
    // ផ្នែកទី៧៖ វិន័យថ្នាក់រៀន អនាម័យ និង ផ្សេងៗ
    // ==========================================
    {
        id: 82,
        title: "គោលការណ៍សំខាន់ៗក្នុងថ្នាក់រៀនសម្រាប់សិស្ស",
        category: "ផ្សេងៗ",
        size: "28.8 MB",
        preview: "previews/classroom_principle_student/student.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1gFTAYXo9b5tyT2uMzoch5gN4z0U3Daui/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 83,
        title: "គោលការណ៍សំខាន់ៗក្នុងថ្នាក់រៀនសម្រាប់គ្រូបង្រៀន",
        category: "ផ្សេងៗ",
        size: "28.8 MB",
        preview: "previews/classroom_principle_teacher/taecher.png",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/18tE-k_hW_7CtRIJ7S9HMG5ysQ_TxZ142/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 84,
        title: "ម៉ែត្រវាស់កម្ពស់",
        category: "ផ្សេងៗ",
        size: "20.9 MB",
        preview: "previews/metter/metter.png",
        sizes: [
            { name: "ទំហំ A3", desc: "ឯកសារទំហំ A3", file: "https://drive.google.com/file/d/1pnTKOEzQqWpFabZXr65GqTXfhNWKeKn3/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 85,
        title: "សកម្មភាពប្រចាំថ្ងៃរបស់ខ្ញុំ",
        category: "ផ្សេងៗ",
        size: "781 KB",
        preview: "https://lh3.googleusercontent.com/d/1v-4BJjv3EUT-0vqK6k6KWLXOuvbMttu6",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1ry8jbE8qfvpijFTSHjm2-dDLGLgH07eN/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 86,
        title: " របៀបដុសធ្មេញ (How to brush teeth)",
        category: "ផ្សេងៗ",
        size: "5,2 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1fr00IVt0zFqdEi9KzxFn5rFduHeDzvQI",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/16mVcnapiONTNfqQfxo7pn1ZKsTfc3Q0t/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1EhFFrsFUsVsn4H8YP8Wa0rX16h4wwr-5/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1tDzW5MxcIJHjQx3EwqVSWmvz_rWq2lmJ/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 87,
        title: "របៀបលាងដៃ (How to wash hands)",
        category: "ផ្សេងៗ",
        size: "5,2 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1RozKeuNemEvHU5vQelYwUFY6Sdql-7-6",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1tA803gJYVriN-V7O2BZW8Jp9QK6X-UBM/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/16sWshMM1vthQ3ADxbEn0J2RuN_lZqME5/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/13q_vs0Xc2P93bCVIzC4ragQejrVX8-MP/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 88,
        title: "របៀបប្រើប្រាស់បង្គន់ (How to use toilet)",
        category: "ផ្សេងៗ",
        size: "4,5 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1JEOuIk9NF7_JOf8-gErC8dJdB37Vx4zq",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1vpC-GiCFFGPqpVEPpzmqsz66Fi7Ggmf6/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/14PFivih2Frpa51c5OZ42_P8TEhRS80FS/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1knAk1dMjfKVZWK6AkaQ8VSLQMQI3nbs6/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 89,
        title: "ឧបករណ៍ភ្លេងខ្មែរ",
        category: "ផ្សេងៗ",
        size: "46.7 MB",
        preview: "previews/Khmer_musical_instruments/kmi.png",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1QtgkGztgjWHwigBArzVeMdHHCnPVB_o2/view?usp=drive_link", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1rH9RRCjvggI1ZnHZ-gvDwfq1AD71A6w2/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1XRS102xGfKx6ARt8CTTI1nQM-KcrQaaD/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 90,
        title: "ឧបករណ៍ភ្លេង Poster musical instruments",
        category: "ផ្សេងៗ",
        size: "7,8 MB",
        preview: "https://lh3.googleusercontent.com/d/1hB-Y-zrKEBKVs1E_N0bkeqcJvd8OT0pw",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1MtP-lGHu95fogv5NxKu6cJMFwI09MBEB/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1p4mfyKFFLvwBQIFJ_2Z4vtEKP2pfapcM/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1k2dMcjERSl3bcLq9pk_EK2ibE69O0dWB/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 91,
        title: "ពាក្យស្លោក (Slogans)",
        category: "ផ្សេងៗ",
        size: "14,7 MB",
        preview: "https://lh3.googleusercontent.com/d/1YcHmwubEd5S-vPK4ng4xbGkdfpHc3V_K",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1OjvLZnrBM6pf3WTkMPXB02SQB6YKssey/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 92,
        title: "ពាក្យស្លោក (Slogans)",
        category: "ផ្សេងៗ",
        size: "14,1 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1W5DbmDKp0P3Ce_siYlShR5RZMCVN9RTI",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1NvTmOfmoG8GXhS9OhV9YtXB3Uk6q24XL/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1Pnk8rPGMGVjOqkMfiyGF8H_mEvLm8VLA/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Ls4pbEfqGD_PZvZmJz5mg9B-9IF57TzC/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 93,
        title: "ពាក្យស្លោក (Slogans)",
        category: "ផ្សេងៗ",
        size: "14,7 and 15,3 MB",
        preview: "https://lh3.googleusercontent.com/d/1AM4PuB1X_gdd3mqxLEeVV11H0Pc3OcQ_",
        sizes: [
            { name: "ទំហំ A0", desc: "ស័ក្តិសមសម្រាប់បោះពុម្ពផ្ទាំងធំ", file: "https://drive.google.com/file/d/1jignnu1edjbHq5ciVkpJdVEHeuoFz68M/view?usp=sharing", icon: "monitor" },
            { name: "ទំហំ A1", desc: "ស័ក្តិសមសម្រាប់បិទលើក្តារខៀន", file: "https://drive.google.com/file/d/1EFbbEs73YlntqlI1UDKgDPm_sZUcMpth/view?usp=sharing", icon: "layout" },
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/11UhgP6AXS4lGhl9DDTVGzJzv9y85CVFq/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 94,
        title: "ដេគ័រ",
        category: "ផ្សេងៗ",
        size: "25.9MB",
        preview: "previews/decor/decor.png",
        sizes: [
            { name: "ទំហំ A3", desc: "ឯកសារទំហំ A3", file: "https://drive.google.com/file/d/1WJ7qu9-lSV1tGHWlcg-sViWU-muW1MZ1/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 95,
        title: "តារាងឈ្មោះកុមារតាមក្រុម (Name list of children by group)",
        category: "ផ្សេងៗ",
        size: "1 MB",
        preview: "https://lh3.googleusercontent.com/d/1yRMduzyBtJ6iNSHu0u9SPYvQ9xi7Adfp",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1Aa1rKm7ZFymgl4YEQITfysPZcbpwM3et/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 96,
        title: " កាតជ្រុងទាំង៥ (Names of the corners)",
        category: "ផ្សេងៗ",
        size: "1 MB",
        preview: "https://lh3.googleusercontent.com/d/1BxVVGkbMxsFYDueVJXSkb7o2xMpFScwr",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1nhadCy3g6RHkH1ZgpNHkIoXb_pyDFz5Z/view?usp=sharing", icon: "file-text" }
        ]
    },
    {
        id: 97,
        title: "បែន័រជើងក្រោម (Wallpaper for bottom)",
        category: "ផ្សេងៗ",
        size: "1,2 MB",
        preview: "https://lh3.googleusercontent.com/d/1T6F5tkfJWoJa5HVbCyyyXtV8m3gR3MWx",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1o0nIRIIHT6m6xCimfotHDieXfbDqfu8j/view?usp=sharing", icon: "file-text" }
        ]
    }, 
    {
        id: 98,
        title: "កាតឈ្មោះមេរៀន Lesson Name Cards",
        category: "ផ្សេងៗ",
        size: "1,1 MB",
        preview: "https://lh3.googleusercontent.com/d/1fP7CY010wzudj2Clf982prnfs7ChKQTJ",
        sizes: [
            { name: "ទំហំដើម", desc: "ឯកសារទំហំធម្មតា", file: "https://drive.google.com/file/d/1zS8FHtXhjiM7aLZG6aGQLcnMjhCT81ET/view?usp=sharing", icon: "file-text" }
        ]
    }
];