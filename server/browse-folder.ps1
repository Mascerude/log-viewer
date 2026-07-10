# Opens the real native Windows "Select Folder" dialog (the modern Explorer
# window in folder-picking mode: address bar, search, sidebar, only folders
# selectable, "Ordner auswählen" button) via the IFileOpenDialog COM API.
#
# .NET Framework's System.Windows.Forms.FolderBrowserDialog is the old, tiny
# tree-view picker and OpenFileDialog is a real file picker — neither is a
# genuine folder picker, so this talks to the underlying COM API directly.

Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace FolderPicker
{
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    internal class FileOpenDialogRCW { }

    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, uint fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter([MarshalAs(UnmanagedType.Interface)] object pFilter);
        void GetResults(out IntPtr ppenum);
        void GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    public static class FolderPickerDialog
    {
        private const uint FOS_PICKFOLDERS = 0x20;
        private const uint FOS_FORCEFILESYSTEM = 0x40;
        private const uint FOS_PATHMUSTEXIST = 0x800;
        private const uint SIGDN_FILESYSPATH = 0x80058000;

        public static string Show(string title, IntPtr owner)
        {
            var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
            dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
            if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
            dialog.SetOkButtonLabel("Ordner auswählen");

            int hr = dialog.Show(owner);
            if (hr != 0) return null; // cancelled or failed

            IShellItem item;
            dialog.GetResult(out item);
            IntPtr pszPath;
            item.GetDisplayName(SIGDN_FILESYSPATH, out pszPath);
            string path = Marshal.PtrToStringUni(pszPath);
            Marshal.FreeCoTaskMem(pszPath);
            return path;
        }
    }
}
"@

# A TopMost, zero-size owner window makes the dialog reliably grab focus and
# appear in front of the browser instead of possibly opening behind it.
$ownerForm = New-Object System.Windows.Forms.Form -Property @{
    TopMost      = $true
    ShowInTaskbar = $false
    Width        = 0
    Height       = 0
    StartPosition = 'CenterScreen'
}
$ownerForm.Show() | Out-Null
$ownerForm.Focus() | Out-Null

$selectedPath = [FolderPicker.FolderPickerDialog]::Show("Log-Ordner auswählen", $ownerForm.Handle)
$ownerForm.Close()

if ($selectedPath) { Write-Output $selectedPath }
