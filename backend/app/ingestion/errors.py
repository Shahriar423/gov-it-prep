class PdfProcessingError(Exception):
    """A problem with the PDF itself. The message is safe to show to the admin."""

    def __init__(self, message: str, page_count: int | None = None):
        super().__init__(message)
        self.message = message
        self.page_count = page_count